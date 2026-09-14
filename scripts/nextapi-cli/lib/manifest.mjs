import path from "node:path";
import { readJson } from "./fsutil.mjs";
import { moduleStagingDir } from "./paths.mjs";

export function loadModuleManifest(id) {
  const manifestPath = path.join(moduleStagingDir(id), "module.json");
  return readJson(manifestPath);
}

// Reads a manifest from an explicit staging directory rather than deriving
// one from a bare id - needed once a shareable:false module can have more
// than one staged copy (see paths.mjs's moduleStagingDirForVersion), so
// "which module.json" is no longer always a pure function of "which id".
export function loadModuleManifestAt(stagingDir) {
  return readJson(path.join(stagingDir, "module.json"));
}

// Very small semver-range check: supports "^x.y.z", ">=x.y.z <a.b.c", and "x.y.z@^range"
// suffix stripping for requires.modules entries like "profile-page@^1.0.0".
export function parseModuleRef(ref) {
  const at = ref.lastIndexOf("@");
  if (at <= 0) return { id: ref, range: null };
  return { id: ref.slice(0, at), range: ref.slice(at + 1) };
}

// Mirrors backend/registry/semver.py's is_valid_semver exactly (same regex),
// so a version string is judged the same way whether checked locally by
// nextapi validate or re-checked server-side at publish time.
const SEMVER_RE = /^\d+\.\d+\.\d+(-[0-9A-Za-z-.]+)?$/;

export function isValidSemver(version) {
  return SEMVER_RE.test(version);
}

function parseVersion(v) {
  const [core] = v.split(/[-+]/);
  const [major, minor, patch] = core.split(".").map(Number);
  return { major, minor, patch };
}

export function compareVersions(a, b) {
  const va = parseVersion(a);
  const vb = parseVersion(b);
  if (va.major !== vb.major) return va.major - vb.major;
  if (va.minor !== vb.minor) return va.minor - vb.minor;
  return va.patch - vb.patch;
}

export function satisfiesRange(version, range) {
  if (!range) return true;
  const clauses = range.trim().split(/\s+/);
  return clauses.every((clause) => {
    const caretMatch = clause.match(/^\^(\d+\.\d+\.\d+)$/);
    if (caretMatch) {
      const base = parseVersion(caretMatch[1]);
      const v = parseVersion(version);
      return v.major === base.major && compareVersions(version, caretMatch[1]) >= 0;
    }
    const cmpMatch = clause.match(/^(>=|<=|>|<)(\d+\.\d+\.\d+)$/);
    if (cmpMatch) {
      const [, op, ver] = cmpMatch;
      const cmp = compareVersions(version, ver);
      if (op === ">=") return cmp >= 0;
      if (op === "<=") return cmp <= 0;
      if (op === ">") return cmp > 0;
      if (op === "<") return cmp < 0;
    }
    throw new Error(`Unsupported version range clause: ${clause}`);
  });
}
