import crypto from "node:crypto";

// Module id shape, mirroring backend/registry/router.py's SCOPED_ID_RE /
// UNSCOPED_ID_RE exactly (docs/MODULE_FACTORY_ARCHITECTURE.md §9.5). Keep
// these two definitions in sync — the server is the actual trust boundary,
// this copy exists so the CLI can derive safe file/route names locally
// without a round-trip.
const SCOPED_ID_RE = /^@([a-z0-9][a-z0-9-]{0,38})\/([a-z0-9][a-z0-9-]{0,63})$/;
const UNSCOPED_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function parseScopedModuleId(id) {
  const scopedMatch = id.match(SCOPED_ID_RE);
  if (scopedMatch) {
    return { scope: scopedMatch[1], name: scopedMatch[2] };
  }
  if (UNSCOPED_ID_RE.test(id)) {
    return { scope: null, name: id };
  }
  throw new Error(
    `Invalid module id '${id}'. Expected lowercase alphanumeric with hyphens, ` +
    `optionally scoped as @username/name (e.g. 'profile-page' or '@alice/profile-page').`
  );
}

function slug(name) {
  return name.replace(/-/g, "_");
}

// docs §9.5.2: a scoped module's backend package name folds the scope in so
// two different accounts' same-named modules never collide on their Python
// package: module_<scope>_<name> vs module_<name> for official/unscoped.
export function moduleBackendPackageName(id) {
  const { scope, name } = parseScopedModuleId(id);
  return scope ? `module_${slug(scope)}_${slug(name)}` : `module_${slug(name)}`;
}

// docs §9.5.2: a scoped module's Mongo collection name is namespaced the
// same way, regardless of what the module's own manifest.backend.collection
// says — the declared name is never trusted verbatim for a scoped module.
export function moduleCollectionName(id, declaredCollection) {
  const { scope, name } = parseScopedModuleId(id);
  if (!scope) return declaredCollection ?? `module_${slug(name)}`;
  return `${slug(scope)}__${declaredCollection ?? `module_${slug(name)}`}`;
}

// A scoped module's declared route gets auto-prefixed at install time with
// a short deterministic hash of its FULL module id (not its scope) - an
// author writes their manifest as if their module were the only one that
// will ever exist; namespacing is applied mechanically here, not left to
// the author to avoid colliding with someone else's identically-named
// route. Hashing the id rather than just the scope also closes a real gap
// scope-only prefixing had: the SAME author's own two modules declaring the
// same route (both say "/profile") would have collided on "/<scope>/profile"
// for both; hashing the full id makes every module's prefix unique
// regardless of who published it or what else they've published.
//
// Deliberately the id, not the publisher's username: nobody browses an
// installed app by typing its URLs, and the sidebar/nav label always comes
// from the module's own manifest.displayName, never from this path - so
// there's no UX reason for a route to expose whose module it is, and every
// reason not to (a consuming app's own URLs shouldn't read as somebody
// else's namespace). checkCollisions (sync/collisionCheck.mjs) still
// verifies uniqueness explicitly rather than trusting the hash blindly.
export function namespacedPath(id, declaredPath) {
  const { scope } = parseScopedModuleId(id);
  if (!scope) return declaredPath;
  const trimmed = declaredPath.replace(/^\//, "");
  const hash = crypto.createHash("sha256").update(id).digest("hex").slice(0, 10);
  return `/${hash}/${trimmed}`;
}

// Version-qualified variants of the two backend naming helpers above, used
// only for a dependency explicitly marked `shareable: false` in its
// manifest (see sync/resolve.mjs) - the whole point of this pair is letting
// two dependents pin genuinely incompatible majors of the same module
// side by side, each getting its own real Python package and its own real
// Mongo collection rather than fighting over one shared name. Deliberately
// separate functions rather than an optional param on the originals: a
// SHARED (shareable: true, the default) module must keep exactly the id-only
// name across every version it's ever published as, or an existing
// consumer's already-generated imports/collection references would break
// on every routine version bump - only a module that opted into per-version
// isolation should ever get a name that changes when its version does.
function versionHash(id, version) {
  return crypto.createHash("sha256").update(`${id}@${version}`).digest("hex").slice(0, 10);
}

export function moduleBackendPackageNameForVersion(id, version) {
  return `module_${versionHash(id, version)}`;
}

export function moduleCollectionNameForVersion(id, version, declaredCollection) {
  const { name } = parseScopedModuleId(id);
  return `${versionHash(id, version)}__${declaredCollection ?? `module_${slug(name)}`}`;
}

// Splits a RESOLVED KEY (as returned by sync/registryFetch.mjs -
// ensureDependenciesStaged: a plain id for the ordinary case, or
// "id::version" for one of several coexisting shareable:false installs)
// back into its parts. version is null for a plain key.
export function splitResolvedKey(key) {
  const sep = key.indexOf("::");
  if (sep === -1) return { id: key, version: null };
  return { id: key.slice(0, sep), version: key.slice(sep + 2) };
}

// Key-aware wrappers every sync step that now iterates resolved keys
// (rather than plain ids) should call instead of the bare-id helpers above -
// they look identical to the plain-id behavior for every ordinary
// (shareable, the default) module, and only diverge - using the
// version-qualified name/hash instead - for a shareable:false module that
// actually got staged at more than one version. Centralized here so every
// call site (filePlacement, mainPyMerge, routesTsMerge, dependencyMerge,
// collisionCheck) makes exactly the same shareable/duplicate decision the
// same way, rather than five separate copies of the same branch drifting
// out of sync with each other over time.
export function backendPackageNameForKey(key, manifest) {
  const { id, version } = splitResolvedKey(key);
  if (manifest.shareable === false && version) return moduleBackendPackageNameForVersion(id, version);
  return moduleBackendPackageName(id);
}

export function collectionNameForKey(key, manifest, declaredCollection) {
  const { id, version } = splitResolvedKey(key);
  if (manifest.shareable === false && version) return moduleCollectionNameForVersion(id, version, declaredCollection);
  return moduleCollectionName(id, declaredCollection);
}

export function namespacedPathForKey(key, manifest, declaredPath) {
  const { id, version } = splitResolvedKey(key);
  const { scope } = parseScopedModuleId(id);
  if (!scope) return declaredPath;
  const trimmed = declaredPath.replace(/^\//, "");
  // A duplicated instance's route must hash something that differs between
  // its coexisting versions too, or two installed majors of the same
  // shareable:false module would collide on the identical frontend route -
  // the same reasoning namespacedPath's own comment gives for hashing the
  // full id instead of just the scope, one level further.
  const hashSource = manifest.shareable === false && version ? `${id}@${version}` : id;
  const hash = crypto.createHash("sha256").update(hashSource).digest("hex").slice(0, 10);
  return `/${hash}/${trimmed}`;
}

// The staging directory on disk still uses the raw id as its folder name
// (scoped ids contain a literal "/", which the filesystem already handles
// as a real subdirectory: .nextapi/modules/@alice/profile-page/ — no
// escaping needed, just documenting the assumption here for anyone reusing
// this path elsewhere).
export function moduleStagingSubpath(id) {
  return id;
}
