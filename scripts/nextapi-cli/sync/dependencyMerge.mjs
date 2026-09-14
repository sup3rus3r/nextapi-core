import { spawnSync } from "node:child_process";
import { BACKEND_DIR, FRONTEND_DIR } from "../lib/paths.mjs";

function run(cmd, args, cwd) {
  console.log(`  $ ${cmd} ${args.join(" ")}  (in ${cwd})`);
  const result = spawnSync(cmd, args, { cwd, stdio: "inherit", shell: true });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${cmd} ${args.join(" ")}`);
  }
}

// Step 5 of docs §6: merge dependencies.frontend.npm / dependencies.backend.pypi
// across all modules being synced, then install once at the end of the batch.
// Delegates to `uv add` / `npm install` rather than hand-editing pyproject.toml /
// package.json, since real dependency resolution (version solving, lockfile
// updates) is exactly what those tools already do correctly.
export function mergeDependencies(order, manifests, extraNpmDeps = []) {
  const npmDeps = [...extraNpmDeps];
  const pypiDeps = [];

  for (const id of order) {
    const manifest = manifests.get(id);
    for (const pkg of Object.keys(manifest.dependencies?.frontend?.npm ?? {})) {
      npmDeps.push(pkg);
    }
    for (const pkg of Object.keys(manifest.dependencies?.backend?.pypi ?? {})) {
      pypiDeps.push(pkg);
    }
  }

  if (npmDeps.length > 0) {
    console.log(`Installing frontend dependencies: ${npmDeps.join(", ")}`);
    run("npm", ["install", ...npmDeps], FRONTEND_DIR);
  }

  if (pypiDeps.length > 0) {
    console.log(`Installing backend dependencies: ${pypiDeps.join(", ")}`);
    run("uv", ["add", ...pypiDeps], BACKEND_DIR);
  }
}
