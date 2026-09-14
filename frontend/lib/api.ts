"use client";

import { getSession } from "next-auth/react";
import { platform } from "@/lib/platform";
import { BACKEND_URL, getStoredToken } from "@/lib/mobile-auth";

async function getToken(): Promise<string | null> {
  if (platform.isNative) {
    return getStoredToken();
  }
  const session = await getSession();
  return session?.accessToken ?? null;
}

/**
 * Fetch wrapper that talks to FastAPI directly, attaching whichever token
 * is appropriate for the current platform (NextAuth session on web, secure
 * storage on native). Native builds are static exports with no Next.js
 * server, so they always hit BACKEND_URL directly rather than the
 * `/api/backend/*` rewrite used on web.
 */
export async function apiFetch(path: string, init: RequestInit = {}) {
  const token = await getToken();
  const url = platform.isNative ? `${BACKEND_URL}${path}` : `/api/backend${path}`;

  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  return fetch(url, { ...init, headers });
}
