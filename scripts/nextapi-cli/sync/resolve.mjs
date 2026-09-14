import fs from "node:fs";
import { loadModuleManifestAt, parseModuleRef, satisfiesRange, compareVersions } from "../lib/manifest.mjs";
import { BACKEND_ENV_PATH, stagingDirForResolvedKey } from "../lib/paths.mjs";
import { splitResolvedKey } from "../lib/moduleId.mjs";

const NEXTAPI_PLATFORM_VERSION = "1.0.0";

function readDatabaseType() {
  if (!fs.existsSync(BACKEND_ENV_PATH)) return "sqlite";
  const content = fs.readFileSync(BACKEND_ENV_PATH, "utf8");
  const match = content.match(/^\s*DATABASE_TYPE\s*=\s*(\S+)\s*$/m);
  return match ? match[1] : "sqlite";
}

// Step 2 of docs §6: resolve the dependency graph across all modules to sync
// (topological order), validate nextapiVersion compat, and hard-gate on Mongo.
//
// `input` is either:
//  - a plain array of module ids (remove.mjs's usage - every id here is
//    already fully installed at exactly one version, so manifests can
//    always be re-derived with the ordinary loadModuleManifest(id)); or
//  - the object ensureDependenciesStaged returns (sync.mjs's usage):
//    { moduleIds, resolvedKeys, manifests }, where moduleIds are RESOLVED
//    KEYS (a plain id for the ordinary shareable case, or "id::version" for
//    a shareable:false dependency staged at more than one version), and
//    resolvedKeys maps "dependentKey::rawRequiresEntry" to the resolved key
//    that satisfies it - because once a module can have more than one
//    staged copy, "which copy does this requires.modules entry mean" is no
//    longer derivable from the raw id alone, and has to be looked up.
export function resolveSyncOrder(input) {
  const isPreResolved = !Array.isArray(input);
  const moduleIds = isPreResolved ? input.moduleIds : input;
  const resolvedKeys = isPreResolved ? input.resolvedKeys : new Map();

  const dbType = readDatabaseType();
  if (moduleIds.length > 0 && dbType !== "mongo") {
    throw new Error(
      `Installed modules (${moduleIds.join(", ")}) require MongoDB. Set DATABASE_TYPE=mongo ` +
      `in backend/.env to use installed modules (see docs/MODULE_PLATFORM_ARCHITECTURE.md §2.1).`
    );
  }

  const manifests = isPreResolved ? new Map(input.manifests) : new Map();
  if (!isPreResolved) {
    // remove.mjs's usage: every id here is a resolved key already (a plain
    // id, or "id::version" for one of several coexisting shareable:false
    // installs, per how sync.mjs now keys the lockfile) - stagingDirForResolvedKey
    // maps either shape back to its real on-disk directory.
    for (const id of moduleIds) manifests.set(id, loadModuleManifestAt(stagingDirForResolvedKey(id)));
  }

  // nextapiVersion compat check
  for (const [key, manifest] of manifests) {
    if (!satisfiesVersionSpec(NEXTAPI_PLATFORM_VERSION, manifest.nextapiVersion)) {
      throw new Error(
        `Module '${key}' requires nextapiVersion ${manifest.nextapiVersion}, but this platform is ${NEXTAPI_PLATFORM_VERSION}.`
      );
    }
  }

  // Groups the manifests actually in hand by their underlying id, so a
  // dependency ref can be matched against every resolved key sharing that
  // id (there may be more than one, for a shareable:false module staged at
  // several versions) even when resolvedKeys wasn't handed a pre-computed
  // answer for it - remove.mjs's plain-array path never calls
  // ensureDependenciesStaged, so nothing has resolved its edges ahead of
  // time the way sync.mjs's does.
  const keysById = new Map();
  for (const key of manifests.keys()) {
    const { id } = splitResolvedKey(key);
    if (!keysById.has(id)) keysById.set(id, []);
    keysById.get(id).push(key);
  }

  function resolveRef(dependentKey, ref) {
    const preResolved = resolvedKeys.get(`${dependentKey}::${ref}`);
    if (preResolved) return preResolved;

    const parsed = parseModuleRef(ref);
    const candidates = (keysById.get(parsed.id) ?? []).filter((k) =>
      satisfiesRange(manifests.get(k).version, parsed.range)
    );
    if (candidates.length === 0) return parsed.id; // not found - reported as missing below
    return candidates.reduce((best, k) =>
      compareVersions(manifests.get(k).version, manifests.get(best).version) > 0 ? k : best
    );
  }

  // Build dependency graph from requires.modules and topologically sort.
  const graph = new Map();
  for (const [key, manifest] of manifests) {
    const deps = (manifest.requires?.modules ?? []).map((ref) => {
      const parsed = parseModuleRef(ref);
      return { ...parsed, resolvedKey: resolveRef(key, ref) };
    });
    graph.set(key, deps);
  }

  for (const [key, deps] of graph) {
    for (const dep of deps) {
      if (!manifests.has(dep.resolvedKey)) {
        throw new Error(
          `Module '${key}' requires '${dep.id}', which is not installed/staged. ` +
          `Run \`nextapi add ${dep.id}\` first.`
        );
      }
      const depManifest = manifests.get(dep.resolvedKey);
      if (!satisfiesRange(depManifest.version, dep.range)) {
        throw new Error(
          `Module '${key}' requires '${dep.id}${dep.range ? "@" + dep.range : ""}', ` +
          `but the staged version is ${depManifest.version}.`
        );
      }
    }
  }

  const order = [];
  const visited = new Set();
  const visiting = new Set();

  function visit(key) {
    if (visited.has(key)) return;
    if (visiting.has(key)) {
      throw new Error(`Circular module dependency detected involving '${key}'.`);
    }
    visiting.add(key);
    for (const dep of graph.get(key) ?? []) visit(dep.resolvedKey);
    visiting.delete(key);
    visited.add(key);
    order.push(key);
  }

  for (const key of moduleIds) visit(key);

  return { order, manifests };
}

function satisfiesVersionSpec(version, spec) {
  // spec like ">=1.0.0 <2.0.0"
  const clauses = spec.trim().split(/\s+/);
  return clauses.every((clause) => satisfiesRange(version, clause));
}
