#!/usr/bin/env node
// Builds a static export of the frontend for Capacitor.
//
// This copies the project into a temp directory, swaps in the mobile
// Next.js config (output: "export"), drops app/api/auth (the NextAuth route
// handler, server-only and unsupported by a static export - other app/api
// files like os.ts are plain helpers and stay), builds there, then copies
// the resulting `out/` back. The real project files (next.config.ts,
// app/api, etc.) are never modified - directory renames proved unreliable
// on Windows (OneDrive/AV file locks), so this avoids touching the working
// tree at all instead of swapping files in place.
import { cpSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outDir = path.join(root, "out");

const SKIP = new Set([
  "node_modules",
  ".next",
  "out",
  "android",
  "ios",
  ".git",
]);

const tmpRoot = mkdtempSync(path.join(tmpdir(), "nextapi-mobile-"));

try {
  console.log(`Staging build in ${tmpRoot} ...`);
  cpSync(root, tmpRoot, {
    recursive: true,
    filter: (src) => {
      const rel = path.relative(root, src);
      const top = rel.split(path.sep)[0];
      return !SKIP.has(top);
    },
  });

  // Only the NextAuth route handler (app/api/auth) is a server route and
  // unsupported by `output: "export"`. app/api also has plain helper
  // modules (os.ts, routes.ts) that pages import directly -those must stay.
  rmSync(path.join(tmpRoot, "app", "api", "auth"), { recursive: true, force: true });

  // Swap in the mobile config (copy, not rename -this is a scratch dir anyway).
  cpSync(
    path.join(tmpRoot, "next.config.mobile.ts"),
    path.join(tmpRoot, "next.config.ts"),
    { force: true },
  );

  console.log("Installing dependencies in staged build...");
  const install = spawnSync("npm", ["install"], { cwd: tmpRoot, stdio: "inherit", shell: true });
  if (install.status !== 0) {
    process.exitCode = install.status ?? 1;
    process.exit();
  }

  console.log("Running next build (static export)...");
  const build = spawnSync("npx", ["next", "build"], { cwd: tmpRoot, stdio: "inherit", shell: true });
  if (build.status !== 0) {
    process.exitCode = build.status ?? 1;
    process.exit();
  }

  const stagedOut = path.join(tmpRoot, "out");
  if (!existsSync(stagedOut)) {
    console.error("Build did not produce an out/ directory.");
    process.exitCode = 1;
    process.exit();
  }

  rmSync(outDir, { recursive: true, force: true });
  cpSync(stagedOut, outDir, { recursive: true });
  console.log(`\nStatic export ready at ${outDir}`);
} finally {
  rmSync(tmpRoot, { recursive: true, force: true });
}
