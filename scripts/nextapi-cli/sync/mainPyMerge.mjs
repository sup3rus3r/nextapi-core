import fs from "node:fs";
import path from "node:path";
import { BACKEND_DIR, MAIN_PY_PATH } from "../lib/paths.mjs";
import { backendPackageNameForKey, namespacedPathForKey } from "../lib/moduleId.mjs";
import { upsertMarkerBlock } from "./markerBlock.mjs";

// `key` is a RESOLVED KEY (registryFetch.mjs) - a plain id for the ordinary
// case, "id::version" for one of several coexisting shareable:false
// installs; backendPackageNameForKey already returns the right package name
// either way.
function moduleVars(key, manifest) {
  const pkg = backendPackageNameForKey(key, manifest);
  // The Python identifier (router variable, collection-class alias) is
  // derived from the same scope-safe package name, not the raw id, so a
  // scoped id's '@'/'/' characters never leak into generated Python source.
  const varBase = pkg.replace(/^module_/, "");
  return { pkg, routerVar: `${varBase}_router`, collectionClassAlias: toPascalCase(varBase) + "Collection" };
}

function toPascalCase(varBase) {
  return varBase.split("_").filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join("");
}

// A module's manifest.backend.models.mongo stays whatever the author
// declared even after sync/collectionSchemaMatch.mjs deletes its
// models_mongo.py because the module got linked to a HOST collection
// instead (see resolveCollectionLink) - the manifest object in memory isn't
// rewritten, only the file on disk is removed. Check the file, not the
// manifest field, so a linked module correctly stops getting its own
// (now-nonexistent) collection imported/indexed here.
function ownsMongoModel(key, manifest) {
  if (!manifest.backend?.models?.mongo) return false;
  const pkg = backendPackageNameForKey(key, manifest);
  return fs.existsSync(path.join(BACKEND_DIR, pkg, "models_mongo.py"));
}

// Step 7 of docs §6 (main.py, three marker-block pairs). Regenerates each block
// fresh from the FULL current module list every run (docs §13 finding #3) — never
// appends to a previous run's block — so removing a module and re-syncing also
// correctly drops its lines.
export function mergeMainPy(order, manifests) {
  const original = fs.readFileSync(MAIN_PY_PATH, "utf8");
  const usesCrlf = original.includes("\r\n");
  let content = original.replace(/\r\n/g, "\n");

  // --- imports block ---
  const importLines = [];
  if (order.length > 0) {
    importLines.push(
      `if DATABASE_TYPE != "mongo":`,
      `    raise RuntimeError(`,
      `        "Installed modules (${order.join(", ")}) require MongoDB. Set "`,
      `        "DATABASE_TYPE=mongo in backend/.env to use installed modules "`,
      `        "(see docs/MODULE_PLATFORM_ARCHITECTURE.md)."`,
      `    )`
    );
    for (const key of order) {
      const manifest = manifests.get(key);
      const { pkg, routerVar, collectionClassAlias } = moduleVars(key, manifest);
      importLines.push(`from ${pkg}.router import router as ${routerVar}`);
      if (ownsMongoModel(key, manifest)) {
        // Discover the collection class name from the module's own models_mongo.py
        // rather than assuming a fixed name — the module author names it whatever
        // they like (ProfileCollection, NoteCollection, ...); import it under a
        // predictable alias to avoid cross-module name collisions in main.py.
        const modelExportName = findCollectionClassName(pkg);
        importLines.push(`from ${pkg}.models_mongo import ${modelExportName} as ${collectionClassAlias}`);
      }
    }
  }
  content = replaceOrInsertBlock(content, "modules:imports", importLines, {
    afterMarker: /if DATABASE_TYPE == "mongo":\n(?:.*\n)*?\s*from models_mongo import UserCollection, APIClientCollection\n/,
  });

  // --- router registration block ---
  const routerLines = order.map((key) => {
    const manifest = manifests.get(key);
    const { routerVar } = moduleVars(key, manifest);
    const route = manifest.frontend?.routes?.[0];
    const declaredPath = route ? route.path : `/${key}`;
    // docs §9.5.2: the backend router prefix is namespaced the same way the
    // frontend route is, so a scoped module's API never collides with
    // another account's identically-named module.
    const prefix = namespacedPathForKey(key, manifest, declaredPath);
    const tag = prefix.replace(/^\//, "");
    return `app.include_router(${routerVar}, prefix="${prefix}", tags=["${tag}"])`;
  });
  content = replaceOrInsertBlock(content, "modules:routers", routerLines, {
    afterMarker: /app\.add_middleware\(\s*CORSMiddleware,[\s\S]*?\)\n/,
  });

  // --- lifespan index-registration block ---
  const indexLines = order
    .filter((key) => ownsMongoModel(key, manifests.get(key)))
    .map((key) => `        await ${moduleVars(key, manifests.get(key)).collectionClassAlias}.create_indexes(db)`);
  content = replaceOrInsertBlock(content, "modules:indexes", indexLines, {
    afterMarker: /await APIClientCollection\.create_indexes\(db\)\n/,
    indent: false, // indexLines already carry their own indent (inside lifespan's elif block)
  });

  if (usesCrlf) content = content.replace(/\n/g, "\r\n");
  fs.writeFileSync(MAIN_PY_PATH, content, "utf8");
}

function findCollectionClassName(pkg) {
  const modelsPath = path.join(BACKEND_DIR, pkg, "models_mongo.py");
  const content = fs.readFileSync(modelsPath, "utf8");
  const match = content.match(/^class (\w*Collection)\b/m);
  if (!match) {
    throw new Error(
      `Could not find a class ending in "Collection" in ${modelsPath}. ` +
      `Module authors must name their Mongo collection helper class *Collection ` +
      `by convention so sync can wire it into main.py's lifespan index creation.`
    );
  }
  return match[1];
}

function replaceOrInsertBlock(content, key, bodyLines, { afterMarker }) {
  const existing = upsertMarkerBlock(content, key, bodyLines);
  if (existing !== null) return existing;

  const startMarker = `# >>> nextapi:${key} (auto-generated, do not edit)`;
  const endMarker = `# <<< nextapi:${key}`;
  const block = `${startMarker}\n${bodyLines.join("\n")}\n${endMarker}\n`;

  if (afterMarker && afterMarker.test(content)) {
    return content.replace(afterMarker, (match) => match + block);
  }
  // Fallback: append at end of file (should not happen against the known host file).
  return content + "\n" + block;
}
