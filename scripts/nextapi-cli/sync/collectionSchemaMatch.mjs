import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { BACKEND_DIR } from "../lib/paths.mjs";
import { backendPackageNameForKey } from "../lib/moduleId.mjs";
import { findHostCollection } from "../lib/hostCollections.mjs";
import { parseModuleModelFields } from "../lib/pythonSchema.mjs";

// A module that declares backend.collection today always gets its OWN,
// fully disconnected Mongo collection (namespaced per module, per
// lib/moduleId.mjs's moduleCollectionName) - even when that collection
// conceptually IS a host-owned resource the app already has (the concrete
// case that motivated this: a "user management" module creating its own
// separate "users" collection that has nothing to do with who can actually
// log into the app). This step closes that gap: if a module's declared
// collection name matches a host collection AND its own Pydantic model's
// fields are a compatible subset of the host's real fields, offer to LINK
// the module to the real collection instead of letting it create a
// duplicate.
//
// Compared against manifest.backend.collection BEFORE namespacing (the raw,
// author-declared name, e.g. "users") - namespacing exists so two modules
// never collide with EACH OTHER (collisionCheck.mjs), which is exactly why
// a module's real, installed collection name is never literally "users" -
// the pre-namespaced declared intent is the only thing that can mean
// anything to compare against a host collection.

function typesCompatible(moduleType, hostType) {
  if (moduleType === hostType) return true;
  // PyObjectId and ObjectId-backed ids are interchangeable in practice - a
  // module modeling its own "id" field almost always means the same Mongo
  // _id the host already uses.
  if (/ObjectId/.test(moduleType) && /ObjectId/.test(hostType)) return true;
  return false;
}

/**
 * Compares a module's own declared Pydantic model fields against a host
 * collection's real fields. Returns { match, compatible, missing, extra }.
 *
 * `missing` lists only REQUIRED-field problems that actually block linking:
 * a module field the host doesn't have (or has with an incompatible type)
 * IS ONLY BLOCKING if that module field is itself required (no default,
 * not Optional) - a module that merely EXTENDS the host shape with its own
 * optional extras (e.g. "department", "phone_number") is still perfectly
 * linkable, since those extra fields simply won't round-trip through the
 * host collection's own methods. The reverse also matters: if the module
 * never declares a field the HOST requires (e.g. a model that never sets
 * hashed_password), calling the host's own create()/etc. through the link
 * would break at runtime - that's blocking regardless of what the module
 * itself calls "required."
 *
 * `extra` lists non-blocking optional-field mismatches separately, purely
 * informational (not printed as a blocker anywhere) - kept in the return
 * shape in case a caller wants to surface "linked, but these fields are
 * module-only and won't persist" without conflating it with an actual
 * failure to link.
 */
export function matchHostCollection(key, manifest) {
  const declaredName = manifest.backend?.collection;
  const hostEntry = findHostCollection(declaredName);
  if (!hostEntry) return { match: null };

  const pkg = backendPackageNameForKey(key, manifest);
  const modelsPath = path.join(BACKEND_DIR, pkg, "models_mongo.py");
  const moduleFields = parseModuleModelFields(modelsPath);
  if (!moduleFields) {
    // Couldn't confidently parse the module's own model - fail closed into
    // "incompatible, here's why" rather than guessing it's fine.
    return {
      match: hostEntry,
      compatible: false,
      missing: [{ field: "(entire model)", moduleType: null, hostType: null, reason: "could not parse the module's Pydantic model" }],
      extra: [],
    };
  }

  const missing = [];
  const extra = [];
  for (const [name, spec] of Object.entries(moduleFields)) {
    const hostField = hostEntry.fields[name];
    const problem = !hostField
      ? { field: name, moduleType: spec.pythonType, hostType: null }
      : !typesCompatible(spec.pythonType, hostField.pythonType)
        ? { field: name, moduleType: spec.pythonType, hostType: hostField.pythonType }
        : null;
    if (!problem) continue;
    if (spec.optional) extra.push(problem);
    else missing.push(problem);
  }

  // A field the HOST requires that the module's own model never declares
  // at all also blocks linking - the module would call the host's real
  // create()/etc. without ever supplying that field.
  for (const [name, hostField] of Object.entries(hostEntry.fields)) {
    if (hostField.optional) continue;
    if (!(name in moduleFields)) {
      missing.push({ field: name, moduleType: null, hostType: hostField.pythonType, reason: `host requires '${name}', module never sets it` });
    }
  }

  return { match: hostEntry, compatible: missing.length === 0, missing, extra };
}

function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

/**
 * Rewrites a module's own placed .py files so they call the host's real
 * collection helper instead of creating and using their own - literal
 * string replacement (the module's own collection-class name -> the host's,
 * imported as a bare top-level import exactly like the pattern the skill
 * prompt already sanctions for reads), the same technique
 * capabilityImportRewrite.mjs already uses for capability imports. Not a
 * Python parser: correctness here rests on the module's own generated code
 * only ever referring to its collection class by the exact name
 * findCollectionClassName would find, which is already a hard requirement
 * for mainPyMerge.mjs's index-creation wiring to work at all.
 */
export function linkToHostCollection(key, manifest, hostEntry) {
  const pkg = backendPackageNameForKey(key, manifest);
  const pkgDir = path.join(BACKEND_DIR, pkg);
  const modelsPath = path.join(pkgDir, "models_mongo.py");
  if (!fs.existsSync(modelsPath)) return;

  const content = fs.readFileSync(modelsPath, "utf8").replace(/\r\n/g, "\n");
  const collectionClassMatch = content.match(/^class\s+(\w*Collection)\b/m);
  if (!collectionClassMatch) return;
  const moduleCollectionClass = collectionClassMatch[1];

  for (const file of fs.readdirSync(pkgDir)) {
    if (!file.endsWith(".py") || file === "models_mongo.py") continue;
    const filePath = path.join(pkgDir, file);
    let fileContent = fs.readFileSync(filePath, "utf8");
    if (!fileContent.includes(moduleCollectionClass)) continue;

    // Replace the module's own relative import of its collection class with
    // a bare import of the host's real one, then replace every reference to
    // the module's class name with the host's - identical net effect to the
    // skill prompt's already-sanctioned `host_models_mongo.UserCollection`
    // pattern, just applied mechanically instead of relying on the author
    // (or AI) to have written it that way from the start.
    fileContent = fileContent
      .replace(
        new RegExp(`from \\.models_mongo import ${moduleCollectionClass}\\b`, "g"),
        `from models_mongo import ${hostEntry.collectionClass}`
      )
      .replace(new RegExp(`\\b${moduleCollectionClass}\\b`, "g"), hostEntry.collectionClass);

    fs.writeFileSync(filePath, fileContent, "utf8");
  }

  // The module no longer owns a collection - mergeMainPy must not import
  // its models_mongo.py or create indexes for it. Deleting the file is the
  // simplest way to make manifest.backend?.models?.mongo's on-disk
  // precondition false for every later step that checks for the file's
  // existence rather than re-reading the manifest.
  fs.rmSync(modelsPath, { force: true });
}

/**
 * Runs the full link-or-report flow for one module. Returns
 * { linked: boolean, report } - `report` is set ({ id, hostCollection,
 * missing }) when the module was left unlinked (incompatible, or the user
 * declined), for sync.mjs to print an end-of-run summary; `linked` tells
 * sync.mjs whether to persist the decision on the module's lockfile entry
 * so a later re-sync (e.g. installing a new version of an already-linked
 * module) doesn't ask again - see the `alreadyLinked` param below for why
 * that's necessary at all: placeModuleFiles re-copies a fresh
 * models_mongo.py from the newly staged version on every sync, regardless
 * of whether the PREVIOUS version was linked, so file presence alone can't
 * distinguish "never asked" from "already said yes last time."
 */
export async function resolveCollectionLink(key, manifest, { yes = false, alreadyLinked = false } = {}) {
  const result = matchHostCollection(key, manifest);
  if (!result.match) return { linked: false, report: null };

  if (!result.compatible) {
    // A module that was linked on a previous version but no longer
    // qualifies (its new version's schema drifted incompatible) falls back
    // to owning its own collection again - flagged distinctly from a
    // first-time mismatch (wasLinked), since this case has real data
    // already sitting in the host's collection under the old link that a
    // generic "wasn't linked" message would leave the user unaware of.
    return {
      linked: false,
      report: { id: key, hostCollection: result.match.collectionClass, missing: result.missing, wasLinked: alreadyLinked },
    };
  }

  let confirmed = yes || alreadyLinked;
  if (!confirmed) {
    const answer = await ask(
      `'${key}' declares a "${manifest.backend.collection}" collection compatible with your existing ${result.match.collectionClass}. Link it instead of creating a separate collection? (y/N) `
    );
    confirmed = answer === "y" || answer === "yes";
  }

  if (confirmed) {
    linkToHostCollection(key, manifest, result.match);
    if (!alreadyLinked) console.log(`Linked '${key}' to your existing ${result.match.collectionClass}.`);
    return { linked: true, report: null };
  }

  return { linked: false, report: null };
}
