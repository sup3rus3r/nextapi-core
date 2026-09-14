import path from "node:path";
import fs from "node:fs";
import { readJson } from "../lib/fsutil.mjs";
import { createTarball } from "../lib/tar.mjs";
import { api, apiMultipart } from "../lib/registryClient.mjs";
import { validateModule } from "../lib/validate.mjs";
import { loadAuth } from "./login.mjs";

// docs §5/§7: publish flow. Runs the same 4 static checks as `nextapi
// validate` first (schema, capabilities, provides-namespacing, file-path
// allowlist) and aborts before any network call if anything fails — no
// point round-tripping to the registry for something checkable locally.
// The backend re-runs its own copy of checks 1-3 at publish time as the
// real trust boundary (see backend/registry/validate.py) since a client
// could always skip or patch this local check.
//
// Publishing packages the module directory into a tarball and uploads it
// alongside the manifest, so a different machine can actually install this
// module later via `nextapi add <id>@<range>`.
export async function publish(moduleDir = process.cwd()) {
  const manifestPath = path.join(moduleDir, "module.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`No module.json found in ${moduleDir}. Run this from inside a module's directory.`);
  }
  const manifest = readJson(manifestPath);
  if (!manifest.id || !manifest.version) {
    throw new Error("module.json must declare both 'id' and 'version'.");
  }

  const { ok, errors } = validateModule(moduleDir);
  if (!ok) {
    console.log(`✗ ${errors.length} problem${errors.length === 1 ? "" : "s"} found:\n`);
    for (const error of errors) console.log(`  ✗ ${error}`);
    throw new Error("Validation failed. Fix the issues above before publishing.");
  }

  const auth = loadAuth();

  console.log(`Publishing '${manifest.id}'@${manifest.version}...`);

  // Register the module id if this is its first publish. A 400 here just
  // means it's already registered (expected on every publish after the
  // first) — only re-throw if it's some other failure.
  try {
    await api("/api/registry/modules", {
      method: "POST",
      auth,
      body: { id: manifest.id, manifest },
    });
    console.log(`Registered new module '${manifest.id}'.`);
  } catch (err) {
    if (!String(err.message).includes("already registered")) {
      throw err;
    }
  }

  console.log("Packaging module files...");
  const tarball = createTarball(moduleDir);
  console.log(`Packaged ${tarball.length} bytes.`);

  const result = await apiMultipart(`/api/registry/modules/${manifest.id}/versions`, {
    auth,
    fields: { manifest: JSON.stringify(manifest) },
    file: {
      name: "artifact",
      filename: `${manifest.id.replace(/\//g, "_")}-${manifest.version}.tar.gz`,
      content: tarball,
      contentType: "application/gzip",
    },
  });

  console.log(`Published '${result.id}'@${result.version}.`);
  console.log(`Status: ${result.validate_status}.`);
}
