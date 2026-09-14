import fs from "node:fs";
import path from "node:path";
import { resolveCapability } from "../lib/capabilities.mjs";
import { parseModuleRef } from "../lib/manifest.mjs";
import { backendPackageNameForKey } from "../lib/moduleId.mjs";
import { BACKEND_DIR } from "../lib/paths.mjs";

function placeholderToken(name) {
  return `__NEXTAPI_CAPABILITY_${name.replace(/[^a-zA-Z0-9_]/g, "_")}__`;
}

/**
 * The mechanism that actually makes cross-module version resolution work,
 * despite Python having nothing like Node's per-caller nested require()
 * resolution: rather than resolving a capability import at run time (which
 * Python's single flat sys.modules namespace can't do differently per
 * caller), the correct answer is computed once, here, at sync time, and
 * baked into the file as an ordinary static import - exactly the same
 * technique already used for frontend route prefixes
 * (__NEXTAPI_BACKEND_PREFIX__, see filePlacement.mjs / publish.py), just
 * applied to backend capability imports instead.
 *
 * A module that declares `functions.uses: ["someCapability@^2.0.0"]` writes
 * its own source against a placeholder rather than a real import:
 *
 *   from __NEXTAPI_CAPABILITY_someCapability__ import notify
 *
 * `nextapi sync` resolves "someCapability" against THIS module's own
 * declared range (not just whatever happens to be staged) and rewrites the
 * placeholder to the real, concrete module path for whichever provider
 * version actually satisfies it - two different consumers of the same
 * capability name at genuinely different (shareable: false) versions each
 * get their own correctly-resolved import, with no ambiguity and no
 * runtime resolver needed.
 *
 * Only touches community (non-builtin) capabilities - a builtin's import
 * path is fixed and always present (it ships with the platform itself, not
 * as an installable module), so authors write those as plain, ordinary
 * imports the same way they always have; this step only ever looks for
 * placeholders, so it's a no-op for a module that only uses builtins.
 */
export function rewriteCapabilityImports(order, manifests) {
  for (const key of order) {
    const manifest = manifests.get(key);
    const uses = manifest.functions?.uses ?? [];
    if (uses.length === 0) continue;

    const packageDir = path.join(BACKEND_DIR, backendPackageNameForKey(key, manifest));
    if (!fs.existsSync(packageDir)) continue;

    const replacements = new Map(); // placeholder token -> resolved module path
    for (const entry of uses) {
      const { id: name, range } = parseModuleRef(entry);
      const resolved = resolveCapability(name, range);
      // A missing/unresolvable capability was already reported by
      // checkCapabilities earlier in the pipeline (sync would have aborted
      // before reaching this step) - this defensive skip only matters for
      // a builtin, which never has a placeholder to replace anyway.
      if (!resolved) continue;
      const lastDot = resolved.import.lastIndexOf(".");
      const modulePath = lastDot === -1 ? resolved.import : resolved.import.slice(0, lastDot);
      replacements.set(placeholderToken(name), modulePath);
    }
    if (replacements.size === 0) continue;

    for (const file of fs.readdirSync(packageDir)) {
      if (!file.endsWith(".py")) continue;
      const filePath = path.join(packageDir, file);
      let content = fs.readFileSync(filePath, "utf8");
      let changed = false;
      for (const [placeholder, modulePath] of replacements) {
        if (content.includes(placeholder)) {
          content = content.split(placeholder).join(modulePath);
          changed = true;
        }
      }
      if (changed) fs.writeFileSync(filePath, content, "utf8");
    }
  }
}
