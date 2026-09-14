// Shared HTTP client for talking to the registry backend. Extracted from
// commands/publish.mjs so the new registry-resolution calls (lib/manifest.mjs
// consumers, sync/registryFetch.mjs, commands/add.mjs) don't each reinvent
// the same fetch/error-handling/base-URL logic.
//
// Hardcoded rather than an env var: nextapi-core always installs modules
// from the one official registry, and that's never per-deployment
// configuration a project would need to override - unlike BACKEND_URL
// (this project's OWN backend, used everywhere else in core: next.config.ts's
// rewrite rule, frontend/auth.ts's NextAuth authorize callback), which is
// necessarily different for every deployment. Routed through the registry's
// own frontend proxy prefix (/api/backend/*), never the raw backend origin
// directly, so the registry's backend is never exposed to installer clients.
const REGISTRY_URL = "https://www.nextapi.app/api/backend";

export function backendUrl() {
  return REGISTRY_URL;
}

/**
 * JSON request/response, matching the existing publish.mjs behavior exactly.
 * `auth`, when given, is { clientId, clientSecret } from .nextapi/auth.json.
 */
export async function api(pathname, { method = "GET", auth, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth) {
    headers["X-API-Key"] = auth.clientId;
    headers["X-API-Secret"] = auth.clientSecret;
  }
  const response = await fetch(`${backendUrl()}${pathname}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.detail ?? `${method} ${pathname} failed (${response.status})`);
  }
  return data;
}

/**
 * Multipart form-data request — used for publish, which sends the manifest
 * as a form field alongside an optional tarball file. `fields` is a plain
 * object of string form fields; `file`, if given, is { name, filename,
 * content: Buffer, contentType }.
 */
export async function apiMultipart(pathname, { method = "POST", auth, fields = {}, file } = {}) {
  const headers = {};
  if (auth) {
    headers["X-API-Key"] = auth.clientId;
    headers["X-API-Secret"] = auth.clientSecret;
  }

  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null) form.append(key, value);
  }
  if (file) {
    form.append(file.name, new Blob([file.content], { type: file.contentType }), file.filename);
  }

  const response = await fetch(`${backendUrl()}${pathname}`, { method, headers, body: form });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.detail ?? `${method} ${pathname} failed (${response.status})`);
  }
  return data;
}

/**
 * Downloads a binary response (a version's tarball artifact) as a Buffer.
 * `auth`, when given, is sent the same way as api()/apiMultipart() — needed
 * so a private module's OWNER can actually download their own artifact
 * (see backend/registry/router.py's download_artifact, which accepts
 * optional auth and 404s a private module for anyone but its owner). Public
 * modules keep working identically with no auth at all.
 */
export async function apiDownload(pathname, { auth } = {}) {
  const headers = {};
  if (auth) {
    headers["X-API-Key"] = auth.clientId;
    headers["X-API-Secret"] = auth.clientSecret;
  }
  const response = await fetch(`${backendUrl()}${pathname}`, { headers });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.detail ?? `GET ${pathname} failed (${response.status})`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
