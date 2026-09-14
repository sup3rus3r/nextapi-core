import path from "node:path";
import { fileURLToPath } from "node:url";
import { moduleBackendPackageName as scopedModuleBackendPackageName, splitResolvedKey } from "./moduleId.mjs";

// scripts/nextapi-cli/lib/paths.mjs -> repo root is three levels up
export const ROOT = path.dirname(path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url)))));

export const FRONTEND_DIR = path.join(ROOT, "frontend");
export const BACKEND_DIR = path.join(ROOT, "backend");
export const NEXTAPI_DIR = path.join(ROOT, ".nextapi");
export const MODULES_STAGING_DIR = path.join(NEXTAPI_DIR, "modules");
export const LOCKFILE_PATH = path.join(NEXTAPI_DIR, "modules.lock.json");
export const AUTH_PATH = path.join(NEXTAPI_DIR, "auth.json");
export const LOCAL_CAPABILITIES_PATH = path.join(NEXTAPI_DIR, "capabilities.local.json");
export const CAPABILITIES_PATH = path.join(ROOT, "scripts", "nextapi-cli", "capabilities.json");
export const UI_KIT_DIR = path.join(ROOT, "scripts", "nextapi-cli", "assets", "ui-kit");
export const UI_KIT_MANIFEST_PATH = path.join(UI_KIT_DIR, "manifest.json");

export const BACKEND_ENV_PATH = path.join(BACKEND_DIR, ".env");
export const FRONTEND_ENV_PATH = path.join(FRONTEND_DIR, ".env.local");
export const MAIN_PY_PATH = path.join(BACKEND_DIR, "main.py");
export const ROUTES_TS_PATH = path.join(FRONTEND_DIR, "config", "routes.ts");
export const BACKEND_PYPROJECT_PATH = path.join(BACKEND_DIR, "pyproject.toml");
export const FRONTEND_PACKAGE_JSON_PATH = path.join(FRONTEND_DIR, "package.json");

export function moduleBackendPackageName(id) {
  return scopedModuleBackendPackageName(id);
}

export function moduleBackendPackageDir(id) {
  return path.join(BACKEND_DIR, moduleBackendPackageName(id));
}

export function moduleStagingDir(id) {
  return path.join(MODULES_STAGING_DIR, id);
}

// Used only for a `shareable: false` dependency staged at more than one
// version at once (see sync/resolve.mjs) - the plain moduleStagingDir(id)
// above always means "the one and only staged copy of this id" and stays
// exactly that for every ordinary (shareable, the default) module; a second,
// incompatible version of a shareable:false module gets its OWN staging
// subdirectory instead of overwriting the first one. "@" and "." are valid
// path characters on Windows/macOS/Linux alike, so <id>@<version> is a safe
// literal directory name with no escaping needed - same reasoning
// moduleStagingSubpath's own comment already relies on for the "/" in a
// scoped id.
export function moduleStagingDirForVersion(id, version) {
  return path.join(MODULES_STAGING_DIR, `${id}@${version}`);
}

// The one canonical way to go from a RESOLVED KEY (moduleId.mjs's
// splitResolvedKey format, "id" or "id::version") back to its staging
// directory - deliberately the only place that conversion happens, so the
// key format ("::") and the on-disk directory naming ("@", chosen for
// readability - "id@version" reads like a familiar package-manager
// convention) never have to be manually kept in sync by every caller.
export function stagingDirForResolvedKey(key) {
  const { id, version } = splitResolvedKey(key);
  return version ? moduleStagingDirForVersion(id, version) : moduleStagingDir(id);
}
