import fs from "node:fs";
import path from "node:path";
import { moduleStagingDir } from "../lib/paths.mjs";
import { copyDirRecursive } from "../lib/fsutil.mjs";
import { loadModuleManifest, parseModuleRef, satisfiesRange } from "../lib/manifest.mjs";
import { stageFromRegistry } from "../lib/registryStage.mjs";
import { loadLockfile, saveLockfile, setModuleEntry } from "../lib/lockfile.mjs";

// `add` resolves a module from either:
// (a) a local path given by the caller, copied into .nextapi/modules/<id>;
// (b) a module already staged at .nextapi/modules/<id> (idempotent re-add),
//     provided the caller gave an EXPLICIT @range/@version that it satisfies; or
// (c) an `id@range`/`id@version` reference not (fully) satisfied locally, or
//     a bare `id` with no range at all, fetched straight from the registry
//     via stageFromRegistry.
//
// A bare id (no @range) is deliberately NEVER satisfied by "whatever happens
// to already be staged" - a real, previously-shipped bug lived here:
// satisfiesRange(version, null) is always true by design (an unconstrained
// request is trivially satisfied by anything), so `add profile-page` after
// profile-page was already staged once silently kept reusing that first
// staged version forever, even after newer versions were published - the
// opposite of what a bare `add <id>` (matching `npm install <pkg>`'s own
// convention) is supposed to mean: "get me the latest." Only an EXPLICIT
// version/range from the caller is a legitimate reason to skip the registry
// round-trip and trust what's already on disk.
export async function addModule(idOrPathOrRef) {
  // A scoped registry ref ("@alice/foo" or "@alice/foo@^1.0.0") also contains
  // "/", so the old bare `.includes("/")` local-path heuristic can no longer
  // be trusted on its own — a real local directory only counts as a local
  // path if it actually exists on disk as a directory.
  const isActuallyLocalPath = fs.existsSync(idOrPathOrRef) && fs.statSync(idOrPathOrRef).isDirectory();

  let id;
  let requestedRange = null;
  let resolvedFrom = "local";

  if (isActuallyLocalPath) {
    const sourceManifestPath = path.join(idOrPathOrRef, "module.json");
    if (!fs.existsSync(sourceManifestPath)) {
      throw new Error(`No module.json found at ${idOrPathOrRef}`);
    }
    const manifest = JSON.parse(fs.readFileSync(sourceManifestPath, "utf8"));
    id = manifest.id;
    const dest = moduleStagingDir(id);
    if (path.resolve(dest) !== path.resolve(idOrPathOrRef)) {
      copyDirRecursive(idOrPathOrRef, dest);
    }
  } else {
    const parsed = parseModuleRef(idOrPathOrRef);
    id = parsed.id;
    requestedRange = parsed.range;

    const dest = moduleStagingDir(id);
    const stagedManifestPath = path.join(dest, "module.json");
    const alreadyStaged = fs.existsSync(stagedManifestPath);
    const stagedSatisfies = alreadyStaged && requestedRange
      && satisfiesRange(JSON.parse(fs.readFileSync(stagedManifestPath, "utf8")).version, requestedRange);

    if (!stagedSatisfies) {
      await stageFromRegistry(id, requestedRange);
      resolvedFrom = "registry";
    }
  }

  const manifest = loadModuleManifest(id);

  const lockfile = loadLockfile();
  setModuleEntry(lockfile, id, {
    id,
    version: manifest.version,
    requestedRange,
    resolvedFrom,
    status: "pending",
    addedAt: new Date().toISOString(),
  });
  saveLockfile(lockfile);

  console.log(`Added '${id}'@${manifest.version} (pending, from ${resolvedFrom}). Run \`npm run nextapi -- sync\` to install it.`);
  return manifest;
}
