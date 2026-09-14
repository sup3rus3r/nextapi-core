import fs from "node:fs";
import path from "node:path";
import { copyDirRecursive, ensureDir, fileHash } from "../lib/fsutil.mjs";
import { BACKEND_DIR, FRONTEND_DIR } from "../lib/paths.mjs";
import { backendPackageNameForKey, namespacedPathForKey } from "../lib/moduleId.mjs";

// Step 6 of docs §6: place a module's frontend route files directly into
// frontend/app/<route>, and its backend files into a new Python package
// (never pasted inline into host files). Returns the list of written file
// paths (for lockfile content-hash recording, used by drift detection in a
// later sync step).
//
// `key` is the RESOLVED KEY from ensureDependenciesStaged - a plain id for
// an ordinary module, or "id::version" for one of several coexisting
// shareable:false installs (see moduleId.mjs's splitResolvedKey). `stagingDir`
// is that key's own staging directory - no longer always derivable from the
// id alone once a module can have more than one staged copy, so it's passed
// in explicitly rather than re-derived here.
export function placeModuleFiles(key, manifest, stagingDir) {
  const staging = stagingDir;
  const written = [];
  const backendPackageName = backendPackageNameForKey(key, manifest);

  for (const route of manifest.frontend?.routes ?? []) {
    const src = path.join(staging, route.sourceDir);
    // docs §9.5.2: scoped modules install under their scope's namespace
    // (@alice/profile-page's declared /profile lands at /alice/profile),
    // never at the author's literally-declared path, so two different
    // accounts' same-named routes can never collide.
    const installPath = namespacedPathForKey(key, manifest, route.path);
    // Modules are written with no shell/layout wrapper of their own (see the
    // builder's reference module) - they assume the host renders them inside
    // its shared shell (sidebar/navbar) via layout nesting. This starter's
    // shell lives on the "(app)" route group (frontend/app/(app)/layout.tsx
    // renders AppShell) - route groups are stripped from the URL, so this
    // only changes which layout wraps the page, not the module's actual path.
    // Placing files directly under app/ (skipping the group) was a real bug:
    // the module rendered under the bare root layout with no sidebar at all.
    const dest = path.join(FRONTEND_DIR, "app", "(app)", installPath.replace(/^\//, ""));
    written.push(...copyDirRecursive(src, dest));
  }

  for (const component of manifest.frontend?.components ?? []) {
    const src = path.join(staging, component.sourceDir);
    const dest = path.join(FRONTEND_DIR, component.targetDir);
    written.push(...copyDirRecursive(src, dest));
  }

  const backendSrc = path.join(staging, "backend");
  if (fs.existsSync(backendSrc)) {
    const backendDest = path.join(BACKEND_DIR, backendPackageName);
    written.push(...copyDirRecursive(backendSrc, backendDest));

    const initPath = path.join(backendDest, "__init__.py");
    if (!fs.existsSync(initPath)) {
      fs.writeFileSync(initPath, "", "utf8");
      written.push(initPath);
    }

    fixSamePackageImports(backendDest, backendPackageName);
  }

  return written.map((p) => ({ path: path.relative(path.dirname(BACKEND_DIR), p), hash: fileHash(p) }));
}

// Correctness gate validated by a real bug in docs §13: a module's own .py files
// must import their own sibling files (models_mongo, schemas, functions) with a
// relative import (`from .models_mongo import X`), never a bare top-level import
// (`from models_mongo import X`) — the latter silently resolves to the HOST's
// top-level module of the same name instead of the module's own file, because
// both sit on the same sys.path under uvicorn. This rewrites any bare import of a
// same-package sibling module to the relative form at install time, so module
// authors who get this wrong don't ship a silently-broken module.
function fixSamePackageImports(packageDir, packageName) {
  const siblingModules = fs
    .readdirSync(packageDir)
    .filter((f) => f.endsWith(".py") && f !== "__init__.py")
    .map((f) => f.replace(/\.py$/, ""));

  for (const file of fs.readdirSync(packageDir)) {
    if (!file.endsWith(".py")) continue;
    const filePath = path.join(packageDir, file);
    let content = fs.readFileSync(filePath, "utf8");
    let changed = false;

    for (const sibling of siblingModules) {
      // `from <sibling> import ...` -> `from .<sibling> import ...`
      const bareImportRe = new RegExp(`(^|\\n)from ${sibling} import`, "g");
      if (bareImportRe.test(content)) {
        content = content.replace(bareImportRe, `$1from .${sibling} import`);
        changed = true;
      }
      // `from module_x.<sibling> import ...` (self-referential absolute) -> relative
      const selfAbsoluteRe = new RegExp(`(^|\\n)from ${packageName}\\.${sibling} import`, "g");
      if (selfAbsoluteRe.test(content)) {
        content = content.replace(selfAbsoluteRe, `$1from .${sibling} import`);
        changed = true;
      }
    }

    if (changed) fs.writeFileSync(filePath, content, "utf8");
  }
}
