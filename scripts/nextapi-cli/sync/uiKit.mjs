import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { readJson, fileHash } from "../lib/fsutil.mjs";
import { FRONTEND_DIR, UI_KIT_DIR, UI_KIT_MANIFEST_PATH } from "../lib/paths.mjs";

// Every published module is written against a fixed set of @/components/ui/*
// primitives (see nextapi_module_factory's builder skill_prompt.py — modules
// are told these are "the only @/components/ui/* paths that actually exist
// on the host"). A starter that doesn't ship the full set yet (like this one
// originally shipped without dialog/alert-dialog/switch/tabs/textarea) makes
// every module that touches one of them fail with a plain "Module not found"
// at build time, with no indication it's a starter gap rather than a module
// bug. This step self-heals that gap on every sync, the same way
// dependencyMerge.mjs self-heals missing npm/pypi packages.

function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

// Ensures the target project's frontend/components/ui/ has every file the
// bundled canonical kit defines. Returns the npm packages (deduped) needed
// by whichever files were actually written, so the caller can fold them into
// the same batched `npm install` sync already runs — mirrors shadcn's own
// `npx shadcn add`: a missing file is added silently, but a file that
// already exists and differs from the canonical version is never overwritten
// without asking (or --yes/-y for non-interactive runs).
export async function ensureUiKit({ yes = false } = {}) {
  const manifest = readJson(UI_KIT_MANIFEST_PATH);
  const targetDir = path.join(FRONTEND_DIR, "components", "ui");
  fs.mkdirSync(targetDir, { recursive: true });

  const npmDeps = new Set();
  const added = [];
  const skipped = [];

  for (const [name, info] of Object.entries(manifest.components)) {
    const srcPath = path.join(UI_KIT_DIR, `${name}.tsx`);
    const destPath = path.join(targetDir, `${name}.tsx`);

    if (!fs.existsSync(destPath)) {
      fs.copyFileSync(srcPath, destPath);
      added.push(name);
      for (const pkg of info.npm) npmDeps.add(pkg);
      continue;
    }

    if (fileHash(srcPath) === fileHash(destPath)) continue; // already up to date

    if (!yes) {
      const answer = await ask(
        `components/ui/${name}.tsx already exists and differs from the platform's version. Overwrite? (y/N) `
      );
      if (answer !== "y" && answer !== "yes") {
        skipped.push(name);
        continue;
      }
    }

    fs.copyFileSync(srcPath, destPath);
    added.push(name);
    for (const pkg of info.npm) npmDeps.add(pkg);
  }

  if (added.length > 0) {
    console.log(`UI kit: wrote ${added.join(", ")} to frontend/components/ui/`);
  }
  if (skipped.length > 0) {
    console.log(`UI kit: kept your existing version of ${skipped.join(", ")} (re-run with --yes to overwrite)`);
  }

  return [...npmDeps];
}
