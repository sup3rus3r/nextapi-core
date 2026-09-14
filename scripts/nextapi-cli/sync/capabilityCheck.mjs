import { resolveCapability } from "../lib/capabilities.mjs";
import { parseModuleRef } from "../lib/manifest.mjs";

// Step 3 of docs §6: validate every module's functions.uses against the builtin +
// local capability registries. Must run in dependency order (order param) so a
// module's own functions.provides are registered before dependents are checked —
// callers are expected to call registerProvidedCapabilities per module as they
// walk `order`, then call this per module afterward.
//
// A `uses` entry may carry a version range exactly like requires.modules does
// ("someCapability@^2.0.0"), reusing parseModuleRef's existing "name@range"
// splitting rather than a second parser - a bare name with no range still
// works (range comes back null, and resolveCapability/satisfiesRange both
// already treat a null range as "anything satisfies").
export function checkCapabilities(moduleId, manifest) {
  const uses = manifest.functions?.uses ?? [];
  const missing = [];
  for (const entry of uses) {
    const { id: name, range } = parseModuleRef(entry);
    if (!resolveCapability(name, range)) missing.push(entry);
  }
  if (missing.length > 0) {
    throw new Error(
      `Module '${moduleId}' requires capabilities not available on this platform: ${missing.join(", ")}.`
    );
  }
}
