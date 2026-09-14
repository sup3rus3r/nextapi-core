import fs from "node:fs";
import { moduleStagingDir } from "./paths.mjs";
import { writeJson, readJson } from "./fsutil.mjs";
import { AUTH_PATH } from "./paths.mjs";
import { api, apiDownload } from "./registryClient.mjs";

/**
 * A saved login token, if one exists — read directly (not via loadAuth(),
 * which throws when logged out) since resolving/downloading a PUBLIC module
 * must keep working with no login at all. Sent whenever present so a private
 * module's owner is correctly recognized as the owner instead of getting the
 * same 404 an anonymous caller would (see backend/registry/router.py's
 * _check_visibility_or_404 — visibility is enforced server-side per request,
 * not by whether the CLI happens to be "logged in").
 */
function optionalAuth() {
  return readJson(AUTH_PATH, null);
}

/**
 * Asks the registry for the best version of `id` satisfying `range` (or the
 * latest, if range is null) WITHOUT downloading anything yet - split out
 * from the actual download so a caller can decide which staging directory
 * to download into with the resolved version already in hand (needed for
 * moduleStagingDirForVersion, see sync/registryFetch.mjs's shareable:false
 * path: the directory name itself depends on the resolved version, so the
 * version has to be known before the destination is chosen).
 *
 * Throws a descriptive error if: the module is unknown to the registry at
 * all (404 from /resolve — also what a private module you don't own looks
 * like, by design, see _check_visibility_or_404's no-existence-leakage
 * behavior), nothing published satisfies the range (uses the
 * available_versions the backend returns to name what DOES exist), or the
 * matched version has no stored artifact (published before tarball upload
 * existed, or via a non-tarball source kind we don't fetch — see
 * backend/registry/router.py's publish_version "source" handling).
 */
export async function resolveFromRegistry(id, range) {
  const auth = optionalAuth();
  const query = range ? `?range=${encodeURIComponent(range)}` : "";
  let result;
  try {
    result = await api(`/api/registry/modules/${id}/resolve${query}`, { auth });
  } catch (err) {
    throw new Error(
      `Module '${id}' is not staged locally and is not a registered module in the registry ` +
      `(${err.message}). Run \`nextapi add <path-to-module>\` with a local path, or publish it first.`
    );
  }

  if (!result.matched) {
    const available = result.available_versions?.length
      ? result.available_versions.join(", ")
      : "(none published)";
    throw new Error(
      `No published version of '${id}' satisfies '${range ?? "latest"}'. Available: ${available}. ` +
      `Run \`nextapi add ${id}@<version>\` once a satisfying version is published.`
    );
  }

  if (!result.has_artifact) {
    throw new Error(
      `'${id}'@${result.version} is registered but has no stored artifact (published without a tarball, ` +
      `or via an unsupported source kind '${result.source?.kind}'). Cannot auto-install it remotely — ` +
      `ask the publisher to republish with \`nextapi publish\`, or stage it manually from a local path.`
    );
  }

  return { version: result.version, manifest: result.manifest, auth };
}

/** Downloads and extracts the already-resolved `id`@`version`'s tarball into `destDir`. */
export async function downloadStaged(id, version, manifest, destDir, auth) {
  const tarball = await apiDownload(`/api/registry/modules/${id}/versions/${version}/download`, { auth });

  fs.mkdirSync(destDir, { recursive: true });
  const { extractTarball } = await import("./tar.mjs");
  extractTarball(tarball, destDir);

  // The extracted module.json IS result.manifest, but writing it explicitly
  // guards against a tarball that (incorrectly) didn't include it.
  writeJson(`${destDir}/module.json`, manifest);
}

/**
 * Convenience wrapper for the ordinary (single-staged-copy) case every
 * caller except sync/registryFetch.mjs's shareable:false path still uses:
 * resolve, then download straight into the plain moduleStagingDir(id).
 * Returns the resolved manifest.
 */
export async function stageFromRegistry(id, range) {
  const { version, manifest, auth } = await resolveFromRegistry(id, range);
  await downloadStaged(id, version, manifest, moduleStagingDir(id), auth);
  return manifest;
}
