import { loadLockfile, saveLockfile, setModuleEntry, getModuleEntry } from "../lib/lockfile.mjs";
import { registerProvidedCapabilities } from "../lib/capabilities.mjs";
import { ensureDependenciesStaged } from "../sync/registryFetch.mjs";
import { resolveSyncOrder } from "../sync/resolve.mjs";
import { checkCapabilities } from "../sync/capabilityCheck.mjs";
import { checkCollisions } from "../sync/collisionCheck.mjs";
import { mergeDependencies } from "../sync/dependencyMerge.mjs";
import { ensureUiKit } from "../sync/uiKit.mjs";
import { placeModuleFiles } from "../sync/filePlacement.mjs";
import { rewriteCapabilityImports } from "../sync/capabilityImportRewrite.mjs";
import { resolveCollectionLink } from "../sync/collectionSchemaMatch.mjs";
import { mergeMainPy } from "../sync/mainPyMerge.mjs";
import { mergeRoutesTs } from "../sync/routesTsMerge.mjs";
import { mergeEnvFile } from "../sync/envMerge.mjs";
import { detectDrift, reportDrift } from "../sync/driftDetection.mjs";
import { checkDevServerRunning } from "../sync/devServerReload.mjs";
import { BACKEND_ENV_PATH, FRONTEND_ENV_PATH } from "../lib/paths.mjs";

// The full 12-step pipeline from docs §6, run against every module currently
// tracked in the lockfile (pending or already-installed — sync is idempotent
// and re-runnable, per docs §7).
export async function sync({ yes = false } = {}) {
  // Step 1: load state
  const lockfile = loadLockfile();
  const moduleIds = Object.keys(lockfile.modules);
  if (moduleIds.length === 0) {
    console.log("No modules to sync.");
    return;
  }

  // Step 1.5 (new): before resolveSyncOrder's synchronous, local-files-only
  // graph resolution runs, walk the transitive requires.modules closure and
  // auto-fetch anything missing/incompatible straight from the registry —
  // see sync/registryFetch.mjs for why this is a separate pre-step rather
  // than folded into resolveSyncOrder itself. Also where version conflicts
  // actually get resolved: a `shareable: false` dependency needed at two
  // incompatible ranges gets staged at BOTH versions side by side, each
  // under its own resolved key ("id::version") - staged.resolvedKeys records
  // which key satisfies which dependent's requires.modules entry, and
  // staged.manifests/stagingDirs hold each key's own manifest/directory,
  // since neither is derivable from a bare id anymore once a module can
  // have more than one staged copy.
  const staged = await ensureDependenciesStaged(moduleIds);

  // Step 2: resolve graph (topological order, nextapiVersion compat, DB gate)
  const { order, manifests } = resolveSyncOrder(staged);
  console.log(`Sync order: ${order.join(" -> ")}`);

  // Step 3: capability check — must run in dependency order so a module's own
  // functions.provides are registered before dependents are checked.
  // `order` entries are RESOLVED KEYS (registryFetch.mjs) - a plain id, or
  // "id::version" for one of several coexisting shareable:false installs.
  for (const key of order) {
    const manifest = manifests.get(key);
    registerProvidedCapabilities(key, manifest);
    checkCapabilities(key, manifest);
  }

  // Step 4: collision dry-run — nothing written until this passes for the whole batch.
  checkCollisions(order, manifests);

  // Step 4.5 (new): self-heal the fixed @/components/ui/* primitive set every
  // published module assumes is already on the host (see uiKit.mjs) — must
  // run before Step 5 so any npm packages it needs (e.g. @radix-ui/react-dialog)
  // land in the same batched install rather than a second npm invocation.
  const uiKitNpmDeps = await ensureUiKit({ yes });

  // Step 5: dependency merge (single batched install)
  mergeDependencies(order, manifests, uiKitNpmDeps);

  // Steps 6-7 per module: file placement + structured merges. Lockfile
  // entries are keyed by resolved key too (not the underlying id) - an
  // ordinary module's key IS its id, unchanged from before, but a
  // shareable:false module staged at two versions gets two distinct
  // lockfile rows, each independently visible to `nextapi list` and
  // individually removable via `nextapi remove`, rather than one row that
  // could only ever describe one of the two coexisting installs.
  const driftReports = [];
  for (const key of order) {
    const manifest = manifests.get(key);
    const previousEntry = getModuleEntry(lockfile, key);

    if (previousEntry?.status === "installed" && previousEntry.files) {
      const { drifted } = detectDrift(previousEntry.files);
      if (drifted.length > 0) driftReports.push({ id: key, drifted });
    }

    const writtenFiles = placeModuleFiles(key, manifest, staged.stagingDirs.get(key));

    mergeEnvFile(BACKEND_ENV_PATH, key, manifest.env?.backend);
    mergeEnvFile(FRONTEND_ENV_PATH, key, manifest.env?.frontend);

    setModuleEntry(lockfile, key, {
      id: key,
      version: manifest.version,
      status: "installed",
      files: writtenFiles,
      syncedAt: new Date().toISOString(),
    });
  }

  // Step 7.5 (new): resolve every community capability import against each
  // consumer's OWN declared range - see capabilityImportRewrite.mjs. Must
  // run after files are placed (needs real files on disk to rewrite) and
  // after registerProvidedCapabilities (Step 3) has populated the local
  // capability registry for every provider in this batch.
  rewriteCapabilityImports(order, manifests);

  // Step 7.6 (new): a module that declares a backend.collection matching a
  // HOST-owned collection (e.g. "users") gets a chance to link to the real
  // thing instead of creating a disconnected duplicate - see
  // collectionSchemaMatch.mjs for why this can't be solved by teaching
  // authors better conventions alone (it has to catch already-published
  // modules too). Must run after placement (needs the module's own
  // models_mongo.py on disk to compare) and before mergeMainPy (linking
  // deletes that file when successful, which mergeMainPy's
  // manifest.backend?.models?.mongo file-existence check needs to see).
  //
  // alreadyLinked reads the PREVIOUS lockfile entry, not anything on disk -
  // placeModuleFiles just re-copied a fresh models_mongo.py from whatever
  // version is being synced now, so file presence can't tell "never asked"
  // apart from "already linked last sync, about to be re-linked silently."
  // Re-persisted on every sync (not just once) so a module that stops
  // qualifying after a version bump correctly falls back to unlinked
  // instead of a stale lockfile flag claiming it's still linked.
  const unlinkedCollections = [];
  for (const key of order) {
    const manifest = manifests.get(key);
    const alreadyLinked = getModuleEntry(lockfile, key)?.linkedCollection === true;
    const { linked, report } = await resolveCollectionLink(key, manifest, { yes, alreadyLinked });
    setModuleEntry(lockfile, key, { linkedCollection: linked });
    if (report) unlinkedCollections.push(report);
  }

  mergeMainPy(order, manifests);
  mergeRoutesTs(order, manifests);

  // Step 9: drift reports (computed above per module, printed now)
  for (const { id, drifted } of driftReports) reportDrift(id, drifted);

  // Step 9.5 (new): field-level report for any module that COULD have linked
  // to a host collection but couldn't (schema mismatch) or wasn't (user
  // declined) - actionable enough for a module author to fix and republish.
  // Does not fail sync: the module installs against its own collection
  // exactly as it would have before this feature existed.
  for (const { id, hostCollection, missing, wasLinked } of unlinkedCollections) {
    if (wasLinked) {
      console.log(
        `\nWarning: '${id}' was linked to your ${hostCollection} before this sync, but its new version no ` +
        `longer matches and has fallen back to its own separate collection. Data it already wrote through the ` +
        `link is still in ${hostCollection} - it does not move. New writes from this module go to its own ` +
        `collection instead until it's re-linked:`
      );
    } else {
      console.log(`\n'${id}' was not linked to your existing ${hostCollection}:`);
    }
    for (const { field, moduleType, hostType, reason } of missing) {
      if (reason) {
        console.log(`  - ${reason}`);
      } else if (hostType) {
        console.log(`  - '${field}': module expects ${moduleType}, host has ${hostType}`);
      } else {
        console.log(`  - '${field}': module expects ${moduleType}, host has no such field`);
      }
    }
  }

  // Step 10: lockfile write
  saveLockfile(lockfile);

  // Step 11: post-install messages
  console.log("\nSync complete.");
  for (const key of order) {
    const message = manifests.get(key).postInstall?.message;
    if (message) console.log(`  [${key}] ${message}`);
  }

  // Step 12: dev-server reload notice
  checkDevServerRunning();
}
