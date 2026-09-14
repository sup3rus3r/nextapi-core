import { readJson, writeJson } from "./fsutil.mjs";
import { CAPABILITIES_PATH, LOCAL_CAPABILITIES_PATH } from "./paths.mjs";
import { backendPackageNameForKey } from "./moduleId.mjs";
import { satisfiesRange, compareVersions } from "./manifest.mjs";

export function loadBuiltinCapabilities() {
  return readJson(CAPABILITIES_PATH).capabilities;
}

// local.json's capabilities are now list-valued: local[name] is an array of
// {since, kind, import, providedBy, version} entries, one per providing
// module version currently staged - not a single overwritten entry. Two
// modules (or two versions of the same module, see resolve.mjs's
// shareable: false path) can legitimately provide the same capability name
// at different versions; resolveCapability below picks the right one per
// consumer instead of whichever provider happened to register last.
export function loadLocalCapabilities() {
  return readJson(LOCAL_CAPABILITIES_PATH, { capabilities: {} }).capabilities;
}

export function saveLocalCapabilities(capabilities) {
  writeJson(LOCAL_CAPABILITIES_PATH, { capabilities });
}

// Registers every capability a module's manifest declares under functions.provides,
// enforcing the naming rule from docs §5: the import path must be rooted under the
// providing module's own backend package, so no two community modules can ever
// export a colliding bare symbol name. `key` is a RESOLVED KEY (registryFetch.mjs)
// - a plain id for the ordinary case, or "id::version" for one of several
// coexisting shareable:false installs; backendPackageNameForKey already
// returns the right package name either way, so callers never need to
// branch on shareable-ness themselves.
export function registerProvidedCapabilities(key, manifest) {
  const provides = manifest.functions?.provides ?? [];
  if (provides.length === 0) return;

  const expectedPrefix = `${backendPackageNameForKey(key, manifest)}.`;
  const local = loadLocalCapabilities();

  for (const cap of provides) {
    if (cap.kind === "python-callable" && !cap.import.startsWith(expectedPrefix)) {
      throw new Error(
        `Module '${key}' declares functions.provides["${cap.name}"] with import ` +
        `path "${cap.import}", which is not namespaced under its own package ` +
        `("${expectedPrefix}*"). Community guideline violation (docs §5): every ` +
        `provided function must be namespaced by the providing module's id to avoid ` +
        `symbol collisions between modules.`
      );
    }
    // Replace-by-providedBy rather than blind push, so re-running sync for
    // the same module/version updates its entry in place instead of
    // accumulating duplicates every time.
    const entries = (local[cap.name] ?? []).filter((e) => e.providedBy !== key);
    entries.push({
      since: cap.since ?? manifest.version,
      kind: cap.kind,
      import: cap.import,
      providedBy: key,
      version: manifest.version,
    });
    local[cap.name] = entries;
  }

  saveLocalCapabilities(local);
}

// requiredRange is the CONSUMING module's own functions.uses range for this
// capability (e.g. "^2.0.0"), not the provider's — mirrors satisfiesRange's
// existing (version, range) argument order used everywhere else in the CLI.
// Builtins are never versioned (they ship with the platform itself, not as
// an installable module), so requiredRange is only meaningful for the local
// (community-provided) lookup.
export function resolveCapability(name, requiredRange) {
  const builtin = loadBuiltinCapabilities();
  if (builtin[name]) return builtin[name];

  const candidates = loadLocalCapabilities()[name] ?? [];
  const satisfying = candidates.filter((c) => satisfiesRange(c.version, requiredRange));
  if (satisfying.length === 0) return null;

  // Highest satisfying version wins when more than one provider/version
  // matches - the same "prefer one shared copy when ranges overlap" choice
  // npm's own resolver makes, so two consumers with compatible-but-different
  // ranges land on the identical resolved entry instead of each getting a
  // needlessly separate copy.
  return satisfying.reduce((best, c) => (compareVersions(c.version, best.version) > 0 ? c : best));
}
