import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { BACKEND_DIR } from "../lib/paths.mjs";
import { backendPackageNameForKey } from "../lib/moduleId.mjs";
import { findHostCollection } from "../lib/hostCollections.mjs";
import {
  parseModuleModelFields,
  findCollectionClassSource,
  listMethodNames,
  extractMethodSource,
} from "../lib/pythonSchema.mjs";

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

const HOST_MODELS_PATH = path.join(BACKEND_DIR, "models_mongo.py");

/**
 * Returns the set of method names the module's OWN files actually call on
 * its collection class (e.g. {"count", "list_page", "find_by_id", ...}) -
 * scanned against the module's original class name, BEFORE
 * linkToHostCollection renames any of those call sites. This is what
 * field-shape compatibility alone can never catch: two collections can
 * agree on every field and still be incompatible at the call-site level if
 * the module's code expects methods the host's real class doesn't have
 * (the exact production failure that motivated this - see
 * AttributeError: 'UserCollection' object has no attribute 'count').
 */
function findCalledMethods(pkgDir, moduleCollectionClass) {
  const calledMethods = new Set();
  const callRe = new RegExp(`\\b${moduleCollectionClass}\\.(\\w+)\\s*\\(`, "g");
  for (const file of fs.readdirSync(pkgDir)) {
    if (!file.endsWith(".py")) continue;
    const content = fs.readFileSync(path.join(pkgDir, file), "utf8");
    for (const m of content.matchAll(callRe)) calledMethods.add(m[1]);
  }
  return calledMethods;
}

/**
 * For every method the module calls that the HOST's real collection class
 * doesn't already have, copies that method's implementation (verbatim, from
 * the module's OWN models_mongo.py) into the host's real file as a new
 * method on the host's real class - purely additive, never touching or
 * replacing any method the host already has (see module-level comment: a
 * same-named host method is always assumed authoritative, this only ever
 * ADDS names that didn't exist before). Returns the list of method names
 * actually adopted, for the caller to record on the lockfile entry and
 * report to the user - writing into the host's own backend file is a
 * materially bigger deal than the field-linking decision and must never be
 * silent.
 *
 * KNOWN LIMITATION, disclosed rather than silently assumed away: this is
 * purely name-based, exactly like the field-compatibility check above. If
 * the module's own call site targets a method name the host's real class
 * ALREADY has (e.g. both define "create"), this function does nothing for
 * that name - the module's call becomes a call to the HOST's existing
 * method (via linkToHostCollection's own class-name rewrite), and there is
 * no way for static analysis to verify the two behave the same way. This
 * mirrors the field-check's own honesty principle (a name match is not a
 * behavior guarantee) rather than overclaiming a safety property this
 * mechanism can't actually provide.
 */
function adoptMissingMethods(moduleModelsPath, moduleCollectionClass, hostEntry) {
  const moduleContent = fs.readFileSync(moduleModelsPath, "utf8").replace(/\r\n/g, "\n");
  const moduleClassSource = findCollectionClassSource(moduleContent, moduleCollectionClass);
  if (!moduleClassSource) return [];

  const pkgDir = path.dirname(moduleModelsPath);
  const calledMethods = findCalledMethods(pkgDir, moduleCollectionClass);

  const hostContent = fs.readFileSync(HOST_MODELS_PATH, "utf8").replace(/\r\n/g, "\n");
  const hostClassSource = findCollectionClassSource(hostContent, hostEntry.collectionClass);
  if (!hostClassSource) return [];
  const hostMethods = listMethodNames(hostClassSource.body);

  const toAdopt = [...calledMethods].filter((name) => !hostMethods.has(name));
  if (toAdopt.length === 0) return [];

  const adopted = [];
  const adoptedSources = [];
  for (const name of toAdopt) {
    const source = extractMethodSource(moduleClassSource.body, name);
    if (!source) continue; // module calls a name it doesn't itself define - nothing to adopt, nothing to report
    adopted.push(name);
    adoptedSources.push(source);
  }
  if (adopted.length === 0) return [];

  // Splice the new methods in right at the end of the host class's own
  // body, using the REAL byte offset findCollectionClassSource already
  // computed against this exact normalized hostContent string - never
  // reconstruct the file from the returned body substring alone, which
  // would silently lose anything after the class (APIClientCollection,
  // etc.) if the offsets and the string it's spliced into ever drifted
  // apart. The class body's own trailing blank lines are trimmed and
  // replaced with exactly two (PEP8's own top-level spacing) before
  // whatever follows - the raw offset otherwise leaves whatever blank-line
  // count the ORIGINAL file happened to have, which can butt a class header
  // right up against the adopted methods with zero separation.
  const beforeBody = hostContent.slice(0, hostClassSource.bodyEnd).replace(/\n+$/, "\n");
  const afterBody = hostContent.slice(hostClassSource.bodyEnd).replace(/^\n*/, "");
  const updatedHostContent = `${beforeBody}\n${adoptedSources.join("\n")}\n\n\n${afterBody}`;

  fs.writeFileSync(HOST_MODELS_PATH, updatedHostContent, "utf8");
  return adopted;
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
 *
 * Also adopts (see adoptMissingMethods) any method the module calls that
 * the host doesn't already have, BEFORE rewriting the module's own class
 * references - method discovery needs the module's ORIGINAL class name
 * still present in its files to find the call sites at all.
 */
export function linkToHostCollection(key, manifest, hostEntry) {
  const pkg = backendPackageNameForKey(key, manifest);
  const pkgDir = path.join(BACKEND_DIR, pkg);
  const modelsPath = path.join(pkgDir, "models_mongo.py");
  if (!fs.existsSync(modelsPath)) return { adoptedMethods: [] };

  const content = fs.readFileSync(modelsPath, "utf8").replace(/\r\n/g, "\n");
  const collectionClassMatch = content.match(/^class\s+(\w*Collection)\b/m);
  if (!collectionClassMatch) return { adoptedMethods: [] };
  const moduleCollectionClass = collectionClassMatch[1];

  const adoptedMethods = adoptMissingMethods(modelsPath, moduleCollectionClass, hostEntry);

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

  return { adoptedMethods };
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
    const { adoptedMethods } = linkToHostCollection(key, manifest, result.match);
    if (!alreadyLinked) {
      console.log(`Linked '${key}' to your existing ${result.match.collectionClass}.`);
      if (adoptedMethods.length > 0) {
        console.log(`  Adopted into ${result.match.collectionClass}: ${adoptedMethods.join(", ")}`);
        console.log(`  (these are now part of your host's ${result.match.collectionClass} - inspect backend/models_mongo.py)`);
      }
    }
    return { linked: true, report: null, adoptedMethods };
  }

  return { linked: false, report: null };
}
