import type { NextConfig } from "next";

// Used only by `npm run build:mobile`. Capacitor bundles a static site into
// the native shell, so this build has no Next.js server: no rewrites, no
// NextAuth route handler, no API routes. The mobile app talks to
// NEXT_PUBLIC_BACKEND_URL directly instead (see lib/api.ts, lib/mobile-auth.ts).
const nextConfig: NextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
