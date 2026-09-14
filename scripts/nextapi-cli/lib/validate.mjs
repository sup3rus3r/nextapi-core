import fs from "node:fs";
import path from "node:path";
import { parseScopedModuleId } from "./moduleId.mjs";
import { isValidSemver } from "./manifest.mjs";
import { registerProvidedCapabilities } from "./capabilities.mjs";
import { checkCapabilities } from "../sync/capabilityCheck.mjs";

const REQUIRED_FIELDS = ["id", "version", "nextapiVersion", "displayName", "description", "category"];

// Same resolved-path-containment check already proven correct in lib/tar.mjs's
// extractTarball — reused here rather than reimplemented, since "does this
// path escape its intended root" is the same question in both places.
function isPathContained(root, candidate) {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  return resolvedCandidate === resolvedRoot || resolvedCandidate.startsWith(resolvedRoot + path.sep);
}

/**
 * The 4 static checks from docs/MODULE_FACTORY_ARCHITECTURE.md §7:
 *   1. module.json schema conformance
 *   2. functions.uses resolves against known capabilities
 *   3. functions.provides import paths are namespaced under the module's own package
 *   4. no file path in the manifest escapes the module's own directory
 *
 * Never throws — collects every problem found and returns them all at once,
 * so a run of `nextapi validate` shows the whole picture instead of stopping
 * at the first issue. The 5th checklist item (a real sandboxed `nextapi sync`
 * install test) is explicitly out of scope here — flagged as a separate,
 * larger follow-up rather than faked.
 */
export function validateModule(moduleDir) {
  const errors = [];
  const manifestPath = path.join(moduleDir, "module.json");

  if (!fs.existsSync(manifestPath)) {
    return { ok: false, errors: [`No module.json found in ${moduleDir}.`] };
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (err) {
    return { ok: false, errors: [`module.json is not valid JSON: ${err.message}`] };
  }

  // --- 1. Schema conformance ---
  for (const field of REQUIRED_FIELDS) {
    if (!manifest[field]) errors.push(`module.json is missing required field "${field}".`);
  }

  if (manifest.id) {
    try {
      parseScopedModuleId(manifest.id);
    } catch (err) {
      errors.push(err.message);
    }
  }

  if (manifest.version && !isValidSemver(manifest.version)) {
    errors.push(`"${manifest.version}" is not valid semver (expected MAJOR.MINOR.PATCH, e.g. "1.2.3").`);
  }

  if (manifest.nextapiVersion && typeof manifest.nextapiVersion !== "string") {
    errors.push(`nextapiVersion must be a string range, e.g. ">=1.0.0 <2.0.0".`);
  }

  if (manifest.visibility !== undefined && manifest.visibility !== "public" && manifest.visibility !== "private") {
    errors.push(`visibility must be "public" or "private", got "${manifest.visibility}".`);
  }

  if (manifest.forkedFrom !== undefined) {
    const forkedFrom = manifest.forkedFrom;
    if (typeof forkedFrom !== "object" || forkedFrom === null || !forkedFrom.id || !forkedFrom.version) {
      errors.push(`forkedFrom must be an object with "id" and "version" fields.`);
    } else {
      try {
        parseScopedModuleId(forkedFrom.id);
      } catch (err) {
        errors.push(`forkedFrom.id is invalid: ${err.message}`);
      }
      if (!isValidSemver(forkedFrom.version)) {
        errors.push(`forkedFrom.version "${forkedFrom.version}" is not valid semver.`);
      }
    }
  }

  // --- 2 & 3. Capabilities + provides-namespacing ---
  // Both registerProvidedCapabilities (namespacing) and checkCapabilities
  // (uses-resolution) already throw well-worded errors — only run them when
  // the id itself is valid, since they derive the expected package prefix
  // from it.
  if (manifest.id) {
    try {
      registerProvidedCapabilities(manifest.id, manifest);
    } catch (err) {
      errors.push(err.message);
    }
    try {
      checkCapabilities(manifest.id, manifest);
    } catch (err) {
      errors.push(err.message);
    }
  }

  // --- 4. File-path allowlist ---
  for (const route of manifest.frontend?.routes ?? []) {
    if (!route.sourceDir) continue;
    const resolved = path.join(moduleDir, route.sourceDir);
    if (!isPathContained(moduleDir, resolved)) {
      errors.push(`frontend.routes[].sourceDir "${route.sourceDir}" escapes the module's own directory.`);
    }
  }
  for (const component of manifest.frontend?.components ?? []) {
    if (!component.sourceDir) continue;
    const resolved = path.join(moduleDir, component.sourceDir);
    if (!isPathContained(moduleDir, resolved)) {
      errors.push(`frontend.components[].sourceDir "${component.sourceDir}" escapes the module's own directory.`);
    }
  }
  const backendDir = path.join(moduleDir, "backend");
  if (fs.existsSync(backendDir) && !isPathContained(moduleDir, backendDir)) {
    errors.push(`backend/ resolves outside the module's own directory.`);
  }

  return { ok: errors.length === 0, errors };
}
