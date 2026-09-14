import fs from "node:fs";
import path from "node:path";
import { fileHash } from "../lib/fsutil.mjs";
import { ROOT } from "../lib/paths.mjs";

// Step 9 of docs §6: for an already-installed module, compare current file
// hashes against the lockfile's recorded hashes. Returns the subset of files
// that are unchanged since last sync (safe to overwrite) vs. drifted (user
// hand-edited; sync must warn and skip rather than silently clobber).
export function detectDrift(previousFiles) {
  if (!previousFiles || previousFiles.length === 0) {
    return { unchanged: [], drifted: [] };
  }
  const unchanged = [];
  const drifted = [];
  for (const record of previousFiles) {
    const absPath = path.join(ROOT, record.path);
    if (!fs.existsSync(absPath)) {
      drifted.push({ ...record, reason: "deleted" });
      continue;
    }
    const currentHash = fileHash(absPath);
    if (currentHash === record.hash) {
      unchanged.push(record);
    } else {
      drifted.push({ ...record, reason: "modified" });
    }
  }
  return { unchanged, drifted };
}

export function reportDrift(moduleId, drifted) {
  if (drifted.length === 0) return;
  console.warn(`\nWarning: module '${moduleId}' has ${drifted.length} hand-edited file(s) since last sync:`);
  for (const f of drifted) {
    console.warn(`  - ${f.path} (${f.reason})`);
  }
  console.warn(`  These files were left untouched. Re-run with --force-overwrite to discard local edits.\n`);
}
