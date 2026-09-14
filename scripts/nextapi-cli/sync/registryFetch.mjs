import fs from "node:fs";
import path from "node:path";
import { moduleStagingDir, moduleStagingDirForVersion, MODULES_STAGING_DIR } from "../lib/paths.mjs";
import { loadModuleManifestAt, satisfiesRange } from "../lib/manifest.mjs";
import { parseModuleRef } from "../lib/manifest.mjs";
import { resolveFromRegistry, downloadStaged } from "../lib/registryStage.mjs";
import { loadLockfile, saveLockfile, setModuleEntry, getModuleEntry } from "../lib/lockfile.mjs";

// Scans .nextapi/modules/ for any already-staged version-qualified copy of
// `id` (directories named "<id>@<version>", see paths.mjs's
// moduleStagingDirForVersion) that satisfies `range`, without touching the
// network. Checked before ever calling resolveFromRegistry for a
// shareable:false conflict, so a re-sync that needs the exact same second
// version it already staged last time doesn't re-fetch it - and, more
// importantly, doesn't require the registry to be reachable at all for
// state that's already sitting on disk from a previous run.
function findStagedVersionedCopy(id, range) {
  const prefix = `${id}@`;
  if (!fs.existsSync(MODULES_STAGING_DIR)) return null;
  for (const entry of fs.readdirSync(MODULES_STAGING_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith(prefix)) continue;
    const dir = path.join(MODULES_STAGING_DIR, entry.name);
    const manifestPath = path.join(dir, "module.json");
    if (!fs.existsSync(manifestPath)) continue;
    const manifest = loadModuleManifestAt(dir);
    if (manifest.id === id && satisfiesRange(manifest.version, range)) {
      return { dir, manifest };
    }
  }
  return null;
}

/**
 * Walks the transitive closure of requires.modules for every module about to
 * be synced, and for anything missing locally or staged at an incompatible
 * version, fetches a satisfying version straight from the registry — before
 * sync's own resolveSyncOrder (which stays synchronous/pure and only ever
 * reads whatever is on disk) ever runs. This is the piece that makes
 * `nextapi sync` behave like npm's auto-install of transitive dependencies,
 * instead of hard-erroring and telling the user to run `add` themselves for
 * every missing dependency one at a time.
 *
 * Also the piece that resolves version conflicts: ordinarily (a module left
 * at its default `shareable: true`) exactly one version can ever be staged
 * at a time, and a dependent whose range doesn't match it is a hard,
 * explicit failure - forking something meant to be a single shared instance
 * would be worse than refusing. A module that opts into `shareable: false`
 * can be staged at more than one version side by side instead (its own
 * version-qualified directory per resolved version, see
 * paths.mjs's moduleStagingDirForVersion) - each dependent gets whichever
 * concrete version actually satisfies ITS OWN declared range, and
 * resolvedKeys (returned below) records which one, so resolveSyncOrder's
 * graph and the sync pipeline's later codegen steps know which physical
 * copy a given require() edge actually points at instead of assuming every
 * edge targets "the" module id.
 *
 * Returns:
 *  - moduleIds: every RESOLVED KEY touched (plain id for the ordinary case,
 *    "id::version" for a duplicated shareable:false instance) - the set
 *    resolveSyncOrder must build its graph over, not just the original
 *    lockfile keys or a naive requires.modules id.
 *  - resolvedKeys: Map from "dependentKey::rawRequiresEntry" to the
 *    resolved key that satisfies it, so resolveSyncOrder never has to
 *    guess which physical copy an edge means.
 *  - manifests / stagingDirs: Maps from resolved key to that key's own
 *    manifest / staging directory - a duplicated instance's manifest can no
 *    longer be derived from its id alone, so these are handed to
 *    resolveSyncOrder rather than having it re-derive them itself.
 */
export async function ensureDependenciesStaged(moduleIds) {
  const visited = new Set(); // resolved keys already walked
  const lockfile = loadLockfile();
  let lockfileChanged = false;

  const manifests = new Map(); // resolved key -> manifest
  const stagingDirs = new Map(); // resolved key -> staging dir
  const resolvedKeys = new Map(); // "dependentKey::rawRef" -> resolved key
  const allKeys = new Set();

  function versionedKey(id, version) {
    return `${id}::${version}`;
  }

  function recordRequiredBy(id, requiredByParentId, resolvedFrom, manifest) {
    const existing = getModuleEntry(lockfile, id);
    const requiredBy = new Set(existing?.requiredBy ?? []);
    if (requiredByParentId) requiredBy.add(requiredByParentId);
    setModuleEntry(lockfile, id, {
      id,
      version: manifest.version,
      resolvedFrom: resolvedFrom ?? existing?.resolvedFrom ?? "local",
      requiredBy: [...requiredBy],
      status: existing?.status ?? "pending",
      addedAt: existing?.addedAt ?? new Date().toISOString(),
    });
    lockfileChanged = true;
  }

  function registerResolved(key, stagingDir, manifest) {
    allKeys.add(key);
    stagingDirs.set(key, stagingDir);
    manifests.set(key, manifest);
  }

  // Ensures `id@range` is available for `requiredByKey` (the dependent's own
  // resolved key, used only for logging/lockfile bookkeeping), returning the
  // RESOLVED KEY that actually satisfies this specific requester.
  async function ensureStaged(id, range, requiredByKey) {
    const plainDir = moduleStagingDir(id);
    const plainStagingPath = `${plainDir}/module.json`;
    const plainStaged = fs.existsSync(plainStagingPath);
    const plainManifest = plainStaged ? loadModuleManifestAt(plainDir) : null;
    const plainSatisfies = plainStaged && satisfiesRange(plainManifest.version, range);

    if (plainSatisfies) {
      if (requiredByKey) recordRequiredBy(id, requiredByKey, undefined, plainManifest);
      registerResolved(id, plainDir, plainManifest);
      return id;
    }

    if (!plainStaged) {
      console.log(
        `${requiredByKey ? `'${requiredByKey}' requires '${id}${range ? "@" + range : ""}'` : `Fetching '${id}'`}` +
        ` — not staged locally — fetching from the registry...`
      );
      const { version, manifest, auth } = await resolveFromRegistry(id, range);
      await downloadStaged(id, version, manifest, plainDir, auth);
      recordRequiredBy(id, requiredByKey, "registry", manifest);
      registerResolved(id, plainDir, manifest);
      return id;
    }

    // Something is plain-staged, but doesn't satisfy this requester's range.
    // Only a module that explicitly opted into shareable: false may be
    // staged at a second, differently-versioned copy - anything else keeps
    // today's behavior: fail immediately and name both requirements,
    // because silently forking a module that expects to be one shared
    // instance would be a worse outcome than refusing outright.
    if (plainManifest.shareable !== false) {
      throw new Error(
        `'${requiredByKey}' requires '${id}@${range}', but the staged version is ${plainManifest.version} ` +
        `('${id}' is shareable, so only one version can be staged at a time - mark it ` +
        `shareable: false in its own manifest if it should support multiple installed majors side by side).`
      );
    }

    // Check disk before the network - a previous sync may have already
    // staged exactly the version-qualified copy this requester needs.
    const existingVersioned = findStagedVersionedCopy(id, range);
    if (existingVersioned) {
      const key = versionedKey(id, existingVersioned.manifest.version);
      registerResolved(key, existingVersioned.dir, existingVersioned.manifest);
      if (requiredByKey) recordRequiredBy(id, requiredByKey, undefined, existingVersioned.manifest);
      return key;
    }

    console.log(
      `'${requiredByKey}' requires '${id}@${range}', which conflicts with the already-staged ` +
      `${plainManifest.version} - '${id}' is marked shareable: false, checking the registry for a ` +
      `version to stage alongside it...`
    );
    const { version, manifest, auth } = await resolveFromRegistry(id, range);
    if (version === plainManifest.version) {
      // Resolved to the exact version already plain-staged (a transient
      // ordering artifact, not a real conflict) - reuse it rather than
      // duplicating a version that's already sitting there.
      if (requiredByKey) recordRequiredBy(id, requiredByKey, undefined, plainManifest);
      registerResolved(id, plainDir, plainManifest);
      return id;
    }

    const key = versionedKey(id, version);
    if (!allKeys.has(key)) {
      const versionedDir = moduleStagingDirForVersion(id, version);
      await downloadStaged(id, version, manifest, versionedDir, auth);
      registerResolved(key, versionedDir, manifest);
    }
    if (requiredByKey) recordRequiredBy(id, requiredByKey, "registry", manifest);
    return key;
  }

  async function visit(key) {
    if (visited.has(key)) return;
    visited.add(key);

    const manifest = manifests.get(key);
    const deps = manifest.requires?.modules ?? [];
    for (const ref of deps) {
      const { id: depId, range } = parseModuleRef(ref);
      const resolvedKey = await ensureStaged(depId, range, key);
      resolvedKeys.set(`${key}::${ref}`, resolvedKey);
      await visit(resolvedKey);
    }
  }

  for (const id of moduleIds) {
    const dir = moduleStagingDir(id);
    registerResolved(id, dir, loadModuleManifestAt(dir));
  }
  for (const id of moduleIds) {
    await visit(id);
  }

  if (lockfileChanged) saveLockfile(lockfile);
  return { moduleIds: [...allKeys], resolvedKeys, manifests, stagingDirs };
}
