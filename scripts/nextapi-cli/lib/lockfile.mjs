import { LOCKFILE_PATH } from "./paths.mjs";
import { readJson, writeJson } from "./fsutil.mjs";

const EMPTY_LOCKFILE = { version: 1, modules: {} };

export function loadLockfile() {
  return readJson(LOCKFILE_PATH, structuredClone(EMPTY_LOCKFILE));
}

export function saveLockfile(lockfile) {
  writeJson(LOCKFILE_PATH, lockfile);
}

export function setModuleEntry(lockfile, id, entry) {
  lockfile.modules[id] = { ...lockfile.modules[id], ...entry };
}

export function removeModuleEntry(lockfile, id) {
  delete lockfile.modules[id];
}

export function getModuleEntry(lockfile, id) {
  return lockfile.modules[id];
}

export function listInstalledModuleIds(lockfile) {
  return Object.keys(lockfile.modules).filter((id) => lockfile.modules[id].status === "installed");
}

export function listPendingModuleIds(lockfile) {
  return Object.keys(lockfile.modules).filter((id) => lockfile.modules[id].status === "pending");
}
