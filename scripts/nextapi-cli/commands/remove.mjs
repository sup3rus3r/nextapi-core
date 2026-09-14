import fs from "node:fs";
import path from "node:path";
import { loadLockfile, saveLockfile, getModuleEntry, removeModuleEntry } from "../lib/lockfile.mjs";
import { loadModuleManifestAt } from "../lib/manifest.mjs";
import { detectDrift } from "../sync/driftDetection.mjs";
import { resolveSyncOrder } from "../sync/resolve.mjs";
import { mergeMainPy } from "../sync/mainPyMerge.mjs";
import { mergeRoutesTs } from "../sync/routesTsMerge.mjs";
import { ROOT, BACKEND_DIR, stagingDirForResolvedKey } from "../lib/paths.mjs";
import { backendPackageNameForKey } from "../lib/moduleId.mjs";

// `id` here is a RESOLVED KEY (registryFetch.mjs/moduleId.mjs's
// splitResolvedKey) - a plain module id for the ordinary case, or
// "id::version" for one of several coexisting shareable:false installs.
// Its manifest is still sitting wherever it was staged (remove never
// touches staging, only the placed/installed files), so it can always be
// re-read from there to know which backend package name this specific key
// actually resolves to.
function backendPackageDirFor(key) {
  const stagingDir = stagingDirForResolvedKey(key);
  const manifest = loadModuleManifestAt(stagingDir);
  return path.join(BACKEND_DIR, backendPackageNameForKey(key, manifest));
}

// docs §7: `nextapi remove <module>` — reverse of sync for that module. Deletes
// only files that match the last-recorded hash (refuses on drifted/hand-edited
// files, same safety rule sync itself uses), drops the lockfile entry, then
// regenerates the shared marker blocks (main.py, routes.ts) from the remaining
// module list — those blocks are always rebuilt fresh from current state
// (docs §13 finding #3), so removing a module from the list and re-running the
// same merge naturally drops its lines rather than needing separate "undo" logic.
// Env vars are left in place by default (destructive to auto-remove secrets);
// pass purgeEnv to also strip them.
export function removeModule(id, { purgeEnv = false, force = false } = {}) {
  const lockfile = loadLockfile();
  const entry = getModuleEntry(lockfile, id);
  if (!entry) {
    throw new Error(`Module '${id}' is not installed.`);
  }

  if (entry.status === "installed" && entry.files) {
    const { unchanged, drifted } = detectDrift(entry.files);
    if (drifted.length > 0 && !force) {
      console.warn(`\nModule '${id}' has ${drifted.length} hand-edited file(s) since last sync:`);
      for (const f of drifted) console.warn(`  - ${f.path} (${f.reason})`);
      console.warn(`These files will be LEFT IN PLACE. Re-run with --force to delete them anyway.\n`);
    }

    const toDelete = force ? entry.files : unchanged;
    for (const record of toDelete) {
      const absPath = path.join(ROOT, record.path);
      if (fs.existsSync(absPath)) fs.rmSync(absPath, { force: true });
    }

    // Python leaves __pycache__/*.pyc behind on import — the CLI never wrote
    // these (they're not in entry.files), so a plain "delete tracked files"
    // pass always leaves the module's package directory non-empty and looking
    // like removal silently failed. Sweep them explicitly, but only when the
    // whole module is actually clear to fully remove (drifted.length === 0,
    // or --force) — otherwise leave everything, including cache dirs, alone.
    if (drifted.length === 0 || force) {
      const backendDir = backendPackageDirFor(id);
      if (fs.existsSync(backendDir)) {
        removePycacheDirs(backendDir);
      }
    }

    pruneEmptyDirs(toDelete.map((r) => path.dirname(path.join(ROOT, r.path))));
    const backendDir = backendPackageDirFor(id);
    if (fs.existsSync(backendDir) && fs.readdirSync(backendDir).length === 0) {
      fs.rmdirSync(backendDir);
    }
  }

  removeModuleEntry(lockfile, id);
  saveLockfile(lockfile);

  // Regenerate main.py / routes.ts marker blocks from the remaining module list.
  const remainingIds = Object.keys(lockfile.modules).filter(
    (mid) => lockfile.modules[mid].status === "installed"
  );
  if (remainingIds.length > 0) {
    const { order, manifests } = resolveSyncOrder(remainingIds);
    mergeMainPy(order, manifests);
    mergeRoutesTs(order, manifests);
  } else {
    // No modules left: still need to clear the marker blocks down to empty.
    mergeMainPy([], new Map());
    mergeRoutesTs([], new Map());
  }

  if (purgeEnv) {
    console.warn(
      `--purge-env is not yet implemented (removing env keys safely requires knowing which ` +
      `values the user has customized vs. left as placeholders) — env vars for '${id}' were left in place.`
    );
  }

  // Linking a module to a host collection can have adopted (copied) methods
  // the module called into the HOST's own models_mongo.py - see
  // collectionSchemaMatch.mjs's adoptMissingMethods. Those methods now live
  // in a file this function never touches (it only deletes the MODULE's own
  // package directory), and another module or the user's own code may have
  // started calling them since - only warn, never auto-delete, same
  // conservative default as the --purge-env case above.
  if (entry.adoptedMethods?.length > 0) {
    console.warn(
      `\nWarning: '${id}' added these methods to your host's models_mongo.py: ${entry.adoptedMethods.join(", ")}.\n` +
      `They are NOT being removed automatically (another module or your own code may now depend on them).\n` +
      `Remove them by hand from backend/models_mongo.py if you're sure nothing else uses them.`
    );
  }

  console.log(`Removed '${id}'. Restart your dev server to unload its backend code.`);
}

function removePycacheDirs(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name === "__pycache__") {
      fs.rmSync(path.join(dir, entry.name), { recursive: true, force: true });
    } else if (entry.isDirectory()) {
      removePycacheDirs(path.join(dir, entry.name));
    }
  }
}

function pruneEmptyDirs(dirs) {
  const unique = [...new Set(dirs)];
  for (const dir of unique) {
    try {
      if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
        fs.rmdirSync(dir);
      }
    } catch {
      // best-effort; leave the directory if it's not empty or not removable
    }
  }
}
