import { loadLockfile } from "../lib/lockfile.mjs";
import { detectDrift } from "../sync/driftDetection.mjs";
import { splitResolvedKey } from "../lib/moduleId.mjs";

// docs §7: `nextapi list` — installed modules, versions, drift status. A
// lockfile key is usually just the module id, but can be a resolved key
// ("id::version") for a shareable:false transitive dependency staged at more
// than one version - splitResolvedKey lets those print as "id@version" like
// everything else instead of the raw internal "id::version@version" form.
export function listModules() {
  const lockfile = loadLockfile();
  const ids = Object.keys(lockfile.modules);

  if (ids.length === 0) {
    console.log("No modules installed.");
    return;
  }

  for (const key of ids) {
    const entry = lockfile.modules[key];
    const { id } = splitResolvedKey(key);
    let driftNote = "";
    if (entry.status === "installed" && entry.files) {
      const { drifted } = detectDrift(entry.files);
      if (drifted.length > 0) driftNote = `  [${drifted.length} file(s) modified since sync]`;
    }
    console.log(`${id}@${entry.version}  (${entry.status})${driftNote}`);
  }
}
