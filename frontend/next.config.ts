import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Without this, Next 308-redirects any rewritten request to strip/add a
  // trailing slash BEFORE the rewrite ever runs (its own page-routing
  // convention bleeding into proxied API paths). That stripped the slash off
  // requests like /api/backend/sup3rus3r/calendar/?start=... before they
  // reached the backend, which then 307-redirected to re-add it - but
  // Starlette builds that redirect's Location as an ABSOLUTE URL from the
  // request's Host header (http://localhost:8000/...), which (a) leaks the
  // backend's real origin straight to the browser, exactly what proxying
  // through /api/backend is meant to prevent, and (b) gets treated as a
  // cross-origin hop, so the browser drops the Authorization header on the
  // follow-up request - every module with a bare GET "/" list endpoint hit
  // this as a silent 401. skipTrailingSlashRedirect stops Next from
  // touching the slash at all, so a correctly-formed request matches the
  // backend's route directly with no redirect involved.
  skipTrailingSlashRedirect: true,
  output: "standalone",
  turbopack: {
    root: __dirname,
  },
  async rewrites() {
    return [
      {
        source      : "/api/auth/:path*",
        destination : "/api/auth/:path*",
      },
      // A request ending in "/" (e.g. a module's GET "/" list endpoint) needs
      // its own rule: Next's :path* capture drops a trailing empty segment on
      // reassembly, so the generic rule below silently strips the slash
      // before forwarding - which then makes FastAPI 307-redirect to re-add
      // it, leaking the backend's raw origin in the Location header and
      // dropping the Authorization header on that now-cross-origin hop (see
      // skipTrailingSlashRedirect's comment above). Matching "/" explicitly
      // and re-appending it in the destination avoids that redirect ever
      // happening. Must come before the slash-less rule below (Next tries
      // rewrites in order).
      {
        source      : "/api/backend/:path*/",
        destination : `${process.env.BACKEND_URL ?? "http://localhost:8000"}/:path*/`,
      },
      {
        source      : "/api/backend/:path*",
        destination : `${process.env.BACKEND_URL ?? "http://localhost:8000"}/:path*`,
      },
      {
        source      : "/api/:path*/",
        destination : `${process.env.BACKEND_URL ?? "http://localhost:8000"}/:path*/`,
      },
      {
        source      : "/api/:path*",
        destination : `${process.env.BACKEND_URL ?? "http://localhost:8000"}/:path*`,
      },
    ];
  },
};

export default nextConfig;
