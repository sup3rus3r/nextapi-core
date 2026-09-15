import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { BACKEND_DIR } from "../lib/paths.mjs";
import { backendPackageNameForKey, collectionNameForKey } from "../lib/moduleId.mjs";
import { findHostCollection } from "../lib/hostCollections.mjs";
import {
  parseModuleModelFields,
  findPydanticModelSource,
  extractFields,
  findCollectionClassSource,
  listMethodNames,
  extractMethodSource,
  demoteFieldToOptional,
} from "../lib/pythonSchema.mjs";
import { sampleFieldPresence } from "../lib/mongoSample.mjs";

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
 * Returns [{ id, fields: Set<string> }] for every OTHER module currently
 * linked to the SAME host collection - read from each module's own
 * lockfile-snapshotted `requiredModuleFields` (recorded once, at that
 * module's own link time, in commands/sync.mjs). This is the only source of
 * truth for "what did an already-linked module require," because linking
 * deletes that module's own models_mongo.py (see linkToHostCollection) - its
 * field declarations are never re-readable from disk after the fact. The
 * snapshot is intentionally immutable history, never re-derived or
 * re-written after its own module links, even if a LATER module's link
 * causes one of its fields to be demoted on the host - it always reflects
 * what that module's own model originally declared.
 */
function linkedModuleRequiredFields(lockfile, hostEntry) {
  const perModule = [];
  for (const id of Object.keys(lockfile?.modules ?? {})) {
    const entry = lockfile.modules[id];
    if (entry.status !== "installed") continue;
    if (entry.linkedCollection !== true) continue;
    if (entry.linkedHostCollection !== hostEntry.collectionName) continue;
    perModule.push({ id, fields: new Set(entry.requiredModuleFields ?? []) });
  }
  return perModule;
}

/**
 * Compares a module's own declared Pydantic model fields against a host
 * collection's real fields, AND against every OTHER module currently linked
 * to the same host collection. Returns { match, compatible, missing, extra,
 * demotionCandidates, requiredModuleFields }.
 *
 * `missing` now lists ONLY genuine TYPE mismatches (a field both sides
 * declare, with incompatible Python types) - the one kind of disagreement
 * demotion can never fix, so it remains an unconditional block exactly as
 * before.
 *
 * Field-PRESENCE disagreements (host requires a field the module doesn't
 * set, or the module requires a field the host/another linked module
 * doesn't have) are NO LONGER an automatic hard block. Instead they become
 * `demotionCandidates`: for any field name required by at least one current
 * party (the host's own live model, this module, or any already-linked
 * module for this same host collection) but NOT required by at least one
 * other current party, resolveCollectionLink asks explicit consent to
 * demote that field to Optional wherever it's still declared required. This
 * is the fix for a real production bug: a published module required
 * `updated_at`, the host had no such field at all, and the old logic
 * treated that as an unconditional rejection - when in fact the correct
 * behavior is "ask whether it's fine for this field to simply not be
 * enforced once linked," since the host's real create() never populates it
 * either way.
 *
 * `demotionCandidates` entries are `{ field, requirerIds, hostHasField }` -
 * `hostHasField` distinguishes a field the host's model actually declares
 * (demotable via demoteFieldToOptional) from one the host has never
 * declared at all (nothing to demote; the only sound action is a
 * consent-only "this won't be enforced" notice, never inventing a new field
 * on the host it never had - that would be promotion by addition, which is
 * explicitly out of scope).
 *
 * `requiredModuleFields` is this module's OWN required-field-name list,
 * snapshotted by the caller into the module's lockfile entry at link time
 * (see commands/sync.mjs) - needed so a LATER module's own
 * matchHostCollection call can see it via linkedModuleRequiredFields.
 *
 * `extra` is unchanged: non-blocking optional-field TYPE mismatches, purely
 * informational.
 */
export function matchHostCollection(key, manifest, lockfile) {
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
      demotionCandidates: [],
      requiredModuleFields: [],
    };
  }

  // Type-shape compatibility stays pairwise and unconditional - the union
  // mechanism below governs only WHETHER a field must be required at all,
  // never what TYPE it must be. Two parties disagreeing on TYPE (not mere
  // optionality) remains a hard block; only "required-but-absent-from-one-
  // party" ever becomes a demotion candidate instead.
  const extra = [];
  const missing = [];
  for (const [name, spec] of Object.entries(moduleFields)) {
    const hostField = hostEntry.fields[name];
    if (!hostField) continue; // presence handled by the union step below, not here
    if (!typesCompatible(spec.pythonType, hostField.pythonType)) {
      const problem = { field: name, moduleType: spec.pythonType, hostType: hostField.pythonType };
      if (spec.optional) extra.push(problem);
      else missing.push(problem);
    }
  }

  const requiredModuleFields = Object.entries(moduleFields)
    .filter(([, spec]) => !spec.optional)
    .map(([name]) => name);

  const requiredHostFields = findRequiredHostFields(hostEntry);
  const linkedModules = linkedModuleRequiredFields(lockfile, hostEntry);

  // Union of every field ANY current party (host, this newly-linking
  // module, or any already-linked module for this same host collection)
  // requires.
  const allRequiredFieldNames = new Set([
    ...requiredHostFields,
    ...requiredModuleFields,
    ...linkedModules.flatMap((m) => [...m.fields]),
  ]);

  const demotionCandidates = [];
  for (const name of allRequiredFieldNames) {
    const hostRequires = requiredHostFields.includes(name);
    const moduleRequires = requiredModuleFields.includes(name);

    const requirerIds = [];
    if (hostRequires) requirerIds.push("host");
    if (moduleRequires) requirerIds.push(key);
    for (const m of linkedModules) if (m.fields.has(name)) requirerIds.push(m.id);

    const nonRequirerIds = [];
    if (!hostRequires) nonRequirerIds.push("host");
    if (!moduleRequires) nonRequirerIds.push(key);
    for (const m of linkedModules) if (!m.fields.has(name)) nonRequirerIds.push(m.id);

    if (nonRequirerIds.length === 0) continue; // every relevant party requires it - stays required, no action

    demotionCandidates.push({ field: name, requirerIds, nonRequirerIds, hostHasField: name in hostEntry.fields });
  }

  return { match: hostEntry, compatible: missing.length === 0, missing, extra, demotionCandidates, requiredModuleFields };
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
 * Computes (WITHOUT writing anything) the methods a module calls that the
 * HOST's real collection class doesn't already have, along with each one's
 * source extracted verbatim from the module's OWN models_mongo.py - purely
 * additive by construction, never touching or replacing any method the host
 * already has (a same-named host method is always assumed authoritative,
 * this only ever proposes ADDING names that didn't exist before). Returns
 * `[{ name, source }]`, for the caller to fold into a link plan that isn't
 * written to disk until every consent it needs (this, plus any field
 * demotions from planFieldDemotions) has been collected - see
 * resolveCollectionLink and applyLinkPlan.
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
function planMethodAdoptions(moduleModelsPath, moduleCollectionClass, hostEntry) {
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

  const planned = [];
  for (const name of toAdopt) {
    const source = extractMethodSource(moduleClassSource.body, name);
    if (!source) continue; // module calls a name it doesn't itself define - nothing to adopt, nothing to report
    planned.push({ name, source });
  }
  return planned;
}

/**
 * Splices already-planned method sources onto the end of a host class body
 * within an in-memory content string - the actual mutation, split out from
 * planMethodAdoptions so it can run as part of the single shared write gate
 * (applyLinkPlan) alongside any field demotions, rather than writing to
 * HOST_MODELS_PATH on its own. Returns the updated content string; does NOT
 * write to disk itself.
 */
function applyMethodAdoptions(hostContent, hostClassSource, adoptedSources) {
  // The class body's own trailing blank lines are trimmed and replaced with
  // exactly two (PEP8's own top-level spacing) before whatever follows - the
  // raw offset otherwise leaves whatever blank-line count the ORIGINAL file
  // happened to have, which can butt a class header right up against the
  // adopted methods with zero separation.
  const beforeBody = hostContent.slice(0, hostClassSource.bodyEnd).replace(/\n+$/, "\n");
  const afterBody = hostContent.slice(hostClassSource.bodyEnd).replace(/^\n*/, "");
  return `${beforeBody}\n${adoptedSources.join("\n")}\n\n\n${afterBody}`;
}

/**
 * Determines which of the host's fields are ACTUALLY required by
 * re-parsing the host's own live Pydantic model (findPydanticModelSource +
 * extractFields against the real, current backend/models_mongo.py) rather
 * than trusting HOST_COLLECTIONS' hand-maintained `optional` flags.
 *
 * This distinction is not academic - it was caught live while testing this
 * exact feature: HOST_COLLECTIONS.users.fields already marks `created_at`
 * as `optional: true`, but the REAL UserMongo class declares
 * `created_at: datetime` with no Optional[...] wrapper at all. Trusting the
 * hand-maintained map would have made planFieldDemotions silently skip
 * sampling the ONE field that caused the real production crash this whole
 * feature exists to catch - the map itself is exactly the kind of
 * declared-schema source this feature is supposed to stop trusting blindly.
 * Falls back to hostEntry.fields' own `optional` flags only if the live
 * model can't be found/parsed at all (e.g. hand-edited into an unparseable
 * shape) - degrading to the previous behavior rather than crashing.
 */
function findRequiredHostFields(hostEntry) {
  const hostContent = fs.readFileSync(HOST_MODELS_PATH, "utf8").replace(/\r\n/g, "\n");
  const modelSource = findPydanticModelSource(hostContent);
  if (!modelSource || modelSource.className !== hostEntry.modelClass) {
    return Object.entries(hostEntry.fields)
      .filter(([, spec]) => !spec.optional)
      .map(([name]) => name);
  }

  const liveFields = extractFields(modelSource.body);
  return Object.keys(hostEntry.fields).filter((name) => {
    const liveField = liveFields[name];
    // A field the live model doesn't even declare can't be judged required
    // by this check - matchHostCollection's own declared-schema comparison
    // already covers that case separately.
    if (!liveField) return false;
    return !liveField.optional;
  });
}

/**
 * For every field the host's own LIVE Pydantic model actually declares
 * required (see findRequiredHostFields - re-parsed from the real file, not
 * the hand-maintained HOST_COLLECTIONS map), samples the host's REAL, live
 * MongoDB collection to see how many existing documents are actually
 * missing that field. The declared-schema comparison in matchHostCollection
 * only ever compares one schema declaration against another (the module's
 * model vs. HOST_COLLECTIONS' hand-maintained field map), which says
 * nothing about whether the host's OWN real data actually matches its OWN
 * model. This is what a purely static/declared check can never catch: a
 * collection's real data can silently drift from its declared model over
 * the app's life (fields added to the model after real rows were already
 * written by a native code path that builds its insert dict by hand, see
 * this module's own doc comment on the incident that motivated this).
 *
 * Returns `[{ field, hostType, missingCount, totalCount }]` for every
 * required field with a real gap - empty (never throws, never blocks a
 * link on its own) when sampling is unavailable (Mongo down/unreachable,
 * see lib/mongoSample.mjs's own fail-soft contract) or finds nothing wrong.
 * This function's whole contract is "only ever ADD friction via an explicit
 * consent prompt downstream, never introduce a new way to silently block or
 * silently allow a link that would otherwise have gone through before this
 * feature existed."
 */
async function planFieldDemotions(hostEntry) {
  const requiredFields = findRequiredHostFields(hostEntry);
  if (requiredFields.length === 0) return [];

  const sample = await sampleFieldPresence(hostEntry.collectionName, requiredFields);
  if (!sample) return [];

  const demotions = [];
  for (const field of requiredFields) {
    const missingCount = sample.missingCounts[field];
    if (missingCount > 0) {
      demotions.push({ field, hostType: hostEntry.fields[field]?.pythonType ?? null, missingCount, totalCount: sample.totalCount });
    }
  }
  return demotions;
}

/**
 * Asks one explicit consent question per field that real-data sampling
 * found genuinely missing from existing documents - separate from the
 * existing "link this module?" prompt and separate from method adoption
 * (which is reported, not separately asked, since it can never remove or
 * change the meaning of anything the host already had). Mutating the host's
 * own schema type is a bigger deal than adding a method, so it gets its own,
 * itemized, per-field question rather than being folded into a bundle.
 *
 * Stops at the first decline - per resolveCollectionLink's contract, ANY
 * decline aborts the WHOLE link (no partial demotions applied), so there is
 * no reason to keep asking once one has already failed. Returns
 * { allConsented, consented } - `consented` is only ever a strict prefix of
 * `demotions` (whatever was agreed to before the first decline, if any);
 * the caller must treat `allConsented: false` as "apply none of them," not
 * "apply the partial prefix."
 */
async function collectFieldDemotionConsent(hostEntry, demotions) {
  const consented = [];
  for (const demotion of demotions) {
    const { field, missingCount, totalCount } = demotion;
    const answer = await ask(
      `'${hostEntry.collectionName}' collection: '${field}' is declared required, but missing from ` +
      `${missingCount.toLocaleString()}/${totalCount.toLocaleString()} existing documents. Demote '${field}' to ` +
      `optional in your host's ${hostEntry.modelClass} model to match reality? (y/N) `
    );
    if (answer !== "y" && answer !== "yes") return { allConsented: false, consented };
    consented.push(demotion);
  }
  return { allConsented: true, consented };
}

/**
 * Splits matchHostCollection's `demotionCandidates` into the two kinds of
 * union-triggered demotion (see matchHostCollection's own doc comment for
 * the full "who requires what" reasoning):
 *
 * - `hostHasField: true` candidates need a REAL mutation (the host's live
 *   model currently declares this field required, and at least one current
 *   party doesn't) - these get `demoteFieldToOptional`'d, exactly the same
 *   primitive/target as the existing real-data-sampling path, just a
 *   different trigger for proposing it.
 * - `hostHasField: false` candidates have nothing to demote - the host's
 *   model has never declared this field at all, so there is no file to
 *   edit. The only sound action is a consent-only notice that the module
 *   won't be able to rely on this field once linked - inventing a new field
 *   on the host it never had would be adding a guarantee, not weakening
 *   one, which is out of scope.
 */
function splitDemotionCandidates(demotionCandidates) {
  const unionDemotions = demotionCandidates.filter((c) => c.hostHasField);
  const moduleOnlyWaivers = demotionCandidates.filter((c) => !c.hostHasField);
  return { unionDemotions, moduleOnlyWaivers };
}

/**
 * Asks one consent question per union-triggered demotion candidate (see
 * splitDemotionCandidates) - itemized, naming every current requirer and
 * non-requirer by id so the user understands the actual conflict rather
 * than just "field X is being changed." Distinct from
 * collectFieldDemotionConsent (real-data-sampling-triggered) only in
 * wording/trigger - the underlying contract (stop at first decline, caller
 * treats a partial `consented` prefix as "apply none") is identical.
 */
async function collectUnionDemotionConsent(hostEntry, candidates) {
  const consented = [];
  for (const candidate of candidates) {
    const { field, requirerIds, nonRequirerIds } = candidate;
    const answer = await ask(
      `'${hostEntry.collectionName}' collection: '${field}' is required by ${requirerIds.join(", ")}, but not by ` +
      `${nonRequirerIds.join(", ")}. Demote '${field}' to optional in your host's ${hostEntry.modelClass} model so ` +
      `all currently-linked modules stay compatible? (y/N) `
    );
    if (answer !== "y" && answer !== "yes") return { allConsented: false, consented };
    consented.push(candidate);
  }
  return { allConsented: true, consented };
}

/**
 * Asks one consent-only question per module-only-waiver candidate (see
 * splitDemotionCandidates) - no host file write happens for these, ever;
 * this only tells the user their module's own field won't be enforced once
 * linked, since the host never had a slot for it in the first place.
 */
async function collectModuleOnlyWaiverConsent(key, hostEntry, candidates) {
  const consented = [];
  for (const candidate of candidates) {
    const { field } = candidate;
    const answer = await ask(
      `'${key}' declares '${field}' as required, but your host's ${hostEntry.collectionClass} has no such field. ` +
      `Link anyway? '${key}' will not be able to rely on '${field}' always being present once linked. (y/N) `
    );
    if (answer !== "y" && answer !== "yes") return { allConsented: false, consented };
    consented.push(candidate);
  }
  return { allConsented: true, consented };
}

/**
 * The ONLY place either a method adoption or a field demotion actually
 * touches HOST_MODELS_PATH. Called exactly once, only after every consent
 * this module's link needs has already been collected (resolveCollectionLink
 * never calls this until the top-level link confirmation AND every field
 * demotion consent have all succeeded) - by construction, nothing upstream
 * of this function may write to the host's file, so a decline anywhere
 * upstream leaves the host's real backend/models_mongo.py byte-for-byte
 * untouched.
 *
 * Reads the host file fresh (not any copy read earlier during planning,
 * which may already be stale if this same sync run already wrote to it for
 * an EARLIER module in the sync order), applies method adoptions first,
 * then field demotions, against the SAME in-memory content string, and
 * writes once.
 */
function applyLinkPlan(hostEntry, plan) {
  let hostContent = fs.readFileSync(HOST_MODELS_PATH, "utf8").replace(/\r\n/g, "\n");

  if (plan.methodAdoptions.length > 0) {
    const hostClassSource = findCollectionClassSource(hostContent, hostEntry.collectionClass);
    if (hostClassSource) {
      hostContent = applyMethodAdoptions(
        hostContent,
        hostClassSource,
        plan.methodAdoptions.map((m) => m.source)
      );
    }
  }

  // hostDataDemotions (real-Mongo-sampling-triggered) and unionDemotions
  // (N-way-requirer-triggered) both resolve to the exact same mutation -
  // demoteFieldToOptional against the host's real model - they only differ
  // in WHY they were proposed, never in HOW they're applied, so they're
  // concatenated and applied identically. moduleOnlyWaivers never reach
  // this function at all (nothing to write for those - see
  // splitDemotionCandidates's own doc comment).
  for (const { field } of [...plan.hostDataDemotions, ...plan.unionDemotions]) {
    const updated = demoteFieldToOptional(hostContent, hostEntry.modelClass, field);
    // If the field line vanished between planning and now (the host file
    // was hand-edited mid-run, or an earlier module's write in this same
    // sync somehow removed it) skip it rather than throw - the method
    // adoptions and any other demotions in this same write still proceed;
    // a demotion that can no longer find its target field is a no-op, not
    // a fatal error for the rest of the plan.
    if (updated) hostContent = updated;
  }

  fs.writeFileSync(HOST_MODELS_PATH, hostContent, "utf8");
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
 * Takes an already-built, already-fully-consented `plan` (see
 * resolveCollectionLink) - this function itself never asks anything and
 * never decides what to adopt/demote, it only applies the plan (via
 * applyLinkPlan) and then does the module's own file rewrite/delete, which
 * is covered by the module's own top-level link consent, not by the
 * host-file consent the plan itself required to be fully built.
 */
export function linkToHostCollection(key, manifest, hostEntry, plan) {
  const pkg = backendPackageNameForKey(key, manifest);
  const pkgDir = path.join(BACKEND_DIR, pkg);
  const modelsPath = path.join(pkgDir, "models_mongo.py");
  if (!fs.existsSync(modelsPath)) return;

  applyLinkPlan(hostEntry, plan);

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
 * A module that declares backend.collection matching a host-owned name
 * (e.g. "users") but does NOT end up linked (incompatible fields, or a
 * declined demotion consent) still keeps its own real UserCollection-style
 * class - and until now, that class's own `collection_name = "users"`
 * literal was NEVER rewritten to anything namespaced, even though
 * collisionCheck.mjs already computes exactly what it should be
 * (collectionNameForKey) to keep two modules from colliding with each
 * other. That "namespaced per module" claim was only ever true for the
 * ABSTRACT collision check - never actually applied to the module's real
 * Python source - so an unlinked module using the host's own collection
 * name in code writes to the SAME PHYSICAL MONGO COLLECTION as the host,
 * despite having a fully separate code path. This is exactly what caused a
 * real production crash: the module's own create_indexes() tried to create
 * a plain (non-unique) "username_1" index on the host's real `users`
 * collection, which already had a UNIQUE "username_1" index from the
 * host's own UserCollection - same auto-generated name, incompatible
 * definition, hard MongoDB error, uvicorn startup failure.
 *
 * Rewrites the module's own collection_name = "<declared>" literal (in its
 * own models_mongo.py, using the module's OWN collection class name found
 * via findCollectionClassSource) to the real namespaced name every other
 * part of this codebase already assumes it has. Only called when
 * matchHostCollection found a REAL host-collection-name collision
 * (result.match is set) that didn't end in a link - a module whose declared
 * name doesn't match any host collection at all has no host-collision risk
 * to fix here (inter-module collisions remain collisionCheck.mjs's job,
 * unchanged).
 */
function renameUnlinkedModuleCollection(key, manifest) {
  const declaredName = manifest.backend?.collection;
  if (!declaredName) return;

  const pkg = backendPackageNameForKey(key, manifest);
  const modelsPath = path.join(BACKEND_DIR, pkg, "models_mongo.py");
  if (!fs.existsSync(modelsPath)) return;

  const content = fs.readFileSync(modelsPath, "utf8").replace(/\r\n/g, "\n");
  const collectionClassMatch = content.match(/^class\s+(\w*Collection)\b/m);
  if (!collectionClassMatch) return;
  const moduleCollectionClass = collectionClassMatch[1];

  const classSource = findCollectionClassSource(content, moduleCollectionClass);
  if (!classSource) return;

  const namespacedName = collectionNameForKey(key, manifest, declaredName);
  if (namespacedName === declaredName) return; // unscoped module - nothing to disambiguate

  // Only rewrites the exact declared literal, inside this class's own body
  // offsets - never touches an unrelated string that happens to match
  // elsewhere in the file (e.g. a docstring or comment).
  const classBody = classSource.body;
  const literalRe = new RegExp(`(collection_name\\s*=\\s*)(['"])${declaredName}\\2`);
  if (!literalRe.test(classBody)) return;

  const updatedClassBody = classBody.replace(literalRe, `$1$2${namespacedName}$2`);
  const updatedContent =
    content.slice(0, classSource.bodyStart) + updatedClassBody + content.slice(classSource.bodyEnd);

  fs.writeFileSync(modelsPath, updatedContent, "utf8");
}

/**
 * Runs the full link-or-report flow for one module. Returns
 * { linked: boolean, report } - `report` is set ({ id, hostCollection,
 * missing }) when the module was left unlinked (a genuine type mismatch, the
 * user declined the link, or the user declined any demotion/waiver
 * consent), for sync.mjs to print an end-of-run summary; `linked` tells
 * sync.mjs whether to persist the decision on the module's lockfile entry so
 * a later re-sync (e.g. installing a new version of an already-linked
 * module) doesn't ask again - see the `alreadyLinked` param below for why
 * that's necessary at all: placeModuleFiles re-copies a fresh
 * models_mongo.py from the newly staged version on every sync, regardless
 * of whether the PREVIOUS version was linked, so file presence alone can't
 * distinguish "never asked" from "already said yes last time."
 *
 * `lockfile` is required now (not optional) - matchHostCollection needs it
 * to see every OTHER module currently linked to the same host collection,
 * for the N-way union compatibility check (see matchHostCollection's own
 * doc comment). commands/sync.mjs already has the lockfile in scope at its
 * call site.
 *
 * Nothing is written to the host's backend/models_mongo.py until EVERY
 * consent this module's link needs has been collected - method adoptions,
 * host-data demotions, union demotions, and module-only waivers are all
 * computed (read-only) up front into a single plan, and applyLinkPlan
 * (inside linkToHostCollection) is the only call that ever writes, called
 * only after the link is confirmed AND every one of those consents has
 * succeeded. A decline anywhere in that sequence returns before any write
 * happens, so there is no partial state to roll back.
 */
export async function resolveCollectionLink(key, manifest, { yes = false, alreadyLinked = false, lockfile } = {}) {
  const result = matchHostCollection(key, manifest, lockfile);
  if (!result.match) return { linked: false, report: null };

  if (!result.compatible) {
    // A genuine TYPE mismatch (not a mere presence disagreement, which is
    // now consent-gated instead of a hard block - see matchHostCollection)
    // still blocks unconditionally. A module that was linked on a previous
    // version but no longer qualifies falls back to owning its own
    // collection again - flagged distinctly from a first-time mismatch
    // (wasLinked), since this case has real data already sitting in the
    // host's collection under the old link that a generic "wasn't linked"
    // message would leave the user unaware of.
    renameUnlinkedModuleCollection(key, manifest);
    return {
      linked: false,
      report: { id: key, hostCollection: result.match.collectionClass, missing: result.missing, wasLinked: alreadyLinked },
    };
  }

  const pkg = backendPackageNameForKey(key, manifest);
  const modelsPath = path.join(BACKEND_DIR, pkg, "models_mongo.py");
  const content = fs.existsSync(modelsPath) ? fs.readFileSync(modelsPath, "utf8").replace(/\r\n/g, "\n") : "";
  const collectionClassMatch = content.match(/^class\s+(\w*Collection)\b/m);
  const moduleCollectionClass = collectionClassMatch?.[1];

  // Everything below only READS - the module's file, the host's file, and
  // (via planFieldDemotions) the host's live Mongo collection - building a
  // fixed plan that every consent question below is asked against. No
  // write happens until linkToHostCollection is reached at the very end.
  const methodAdoptions = moduleCollectionClass
    ? planMethodAdoptions(modelsPath, moduleCollectionClass, result.match)
    : [];
  const hostDataDemotions = await planFieldDemotions(result.match);
  // A field the real-Mongo-sampling path already proposed doesn't need to
  // be asked about again just because the union check also flagged it (this
  // happens whenever the host itself is one of the "non-requirer" parties
  // AND its real data also shows a gap for that same field) - dedupe by
  // field name, keeping the union entry out in favor of the already-planned
  // sampling one, so a field is only ever asked about once per sync run.
  const hostDataFieldNames = new Set(hostDataDemotions.map((d) => d.field));
  const { unionDemotions, moduleOnlyWaivers } = splitDemotionCandidates(
    result.demotionCandidates.filter((c) => !hostDataFieldNames.has(c.field))
  );

  let confirmed = yes || alreadyLinked;
  if (!confirmed) {
    const answer = await ask(
      `'${key}' declares a "${manifest.backend.collection}" collection compatible with your existing ${result.match.collectionClass}. Link it instead of creating a separate collection? (y/N) `
    );
    confirmed = answer === "y" || answer === "yes";
  }
  if (!confirmed) return { linked: false, report: null };

  // Every demotion/waiver consent below is asked even on a re-sync where
  // `yes`/`alreadyLinked` already answered the top-level link question - a
  // schema-mutating consent must never be silently implied by an unrelated
  // flag from a PREVIOUS run. `--yes` (THIS run's own flag) auto-consents to
  // all of them, same as it already auto-consents to the link prompt - --yes
  // already means "unattended, trust the defaults" everywhere else in this
  // CLI (mergeDependencies, ensureUiKit), so this stays consistent rather
  // than inventing a new, narrower meaning for it here.
  function declineUnlinked(declinedField, reason) {
    console.log(
      `\n'${key}' was not linked to your existing ${result.match.collectionClass}: declined consent for ` +
      `'${declinedField}'. No changes were made to your host's backend/models_mongo.py.`
    );
    renameUnlinkedModuleCollection(key, manifest);
    return {
      linked: false,
      report: {
        id: key,
        hostCollection: result.match.collectionClass,
        missing: [{ field: declinedField, moduleType: null, hostType: result.match.fields[declinedField]?.pythonType ?? null, reason }],
        wasLinked: alreadyLinked,
      },
    };
  }

  let hostDataDemotionsToApply = hostDataDemotions;
  if (hostDataDemotions.length > 0 && !yes) {
    const { allConsented, consented } = await collectFieldDemotionConsent(result.match, hostDataDemotions);
    if (!allConsented) {
      const declinedField = hostDataDemotions[consented.length].field;
      return declineUnlinked(declinedField, `real-data sampling found '${declinedField}' missing from existing documents, and demotion consent was declined`);
    }
    hostDataDemotionsToApply = consented;
  }

  let unionDemotionsToApply = unionDemotions;
  if (unionDemotions.length > 0 && !yes) {
    const { allConsented, consented } = await collectUnionDemotionConsent(result.match, unionDemotions);
    if (!allConsented) {
      const declinedField = unionDemotions[consented.length].field;
      const declinedCandidate = unionDemotions[consented.length];
      return declineUnlinked(
        declinedField,
        `'${declinedField}' is required by ${declinedCandidate.requirerIds.join(", ")} but not by ${declinedCandidate.nonRequirerIds.join(", ")}, and demotion consent was declined`
      );
    }
    unionDemotionsToApply = consented;
  }

  let moduleOnlyWaiversToApply = moduleOnlyWaivers;
  if (moduleOnlyWaivers.length > 0 && !yes) {
    const { allConsented, consented } = await collectModuleOnlyWaiverConsent(key, result.match, moduleOnlyWaivers);
    if (!allConsented) {
      const declinedField = moduleOnlyWaivers[consented.length].field;
      return declineUnlinked(declinedField, `'${key}' requires '${declinedField}', which your host's ${result.match.collectionClass} has no field for, and the waiver was declined`);
    }
    moduleOnlyWaiversToApply = consented;
  }

  const plan = { methodAdoptions, hostDataDemotions: hostDataDemotionsToApply, unionDemotions: unionDemotionsToApply };
  linkToHostCollection(key, manifest, result.match, plan);

  const allDemotedFields = [...plan.hostDataDemotions, ...plan.unionDemotions];

  if (!alreadyLinked) {
    console.log(`Linked '${key}' to your existing ${result.match.collectionClass}.`);
    if (plan.methodAdoptions.length > 0) {
      console.log(`  Adopted into ${result.match.collectionClass}: ${plan.methodAdoptions.map((m) => m.name).join(", ")}`);
      console.log(`  (these are now part of your host's ${result.match.collectionClass} - inspect backend/models_mongo.py)`);
    }
    if (allDemotedFields.length > 0) {
      console.log(`  Demoted to optional in ${result.match.modelClass}: ${allDemotedFields.map((d) => d.field).join(", ")}`);
    }
    if (moduleOnlyWaiversToApply.length > 0) {
      console.log(`  Not enforced (host has no such field): ${moduleOnlyWaiversToApply.map((w) => w.field).join(", ")}`);
    }
  }

  return {
    linked: true,
    report: null,
    adoptedMethods: plan.methodAdoptions.map((m) => m.name),
    demotedFields: allDemotedFields.map((d) => ({ collectionClass: result.match.modelClass, field: d.field })),
    linkedHostCollection: result.match.collectionName,
    requiredModuleFields: result.requiredModuleFields,
  };
}
