"use client";

import { encryptPayload } from "@/lib/crypto";

// Loaded dynamically, by a non-literal specifier, so neither the web
// bundler nor the type checker require `@capacitor/preferences` to be
// installed until `npm run add:mobile` adds it.
interface PreferencesPlugin {
  get(opts: { key: string }): Promise<{ value: string | null }>;
  set(opts: { key: string; value: string }): Promise<void>;
  remove(opts: { key: string }): Promise<void>;
}

async function getPreferences(): Promise<PreferencesPlugin | null> {
  try {
    const specifier = "@capacitor/preferences";
    const mod = await import(/* webpackIgnore: true */ specifier);
    return mod?.Preferences ?? null;
  } catch {
    return null;
  }
}

const TOKEN_KEY = "nextapi_access_token";
const USER_KEY = "nextapi_user";

export const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

export interface MobileUser {
  id: string;
  username: string;
  email: string;
  role: string;
}

interface LoginResult {
  accessToken: string;
  user: MobileUser;
}

async function request(path: string, payload: object) {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ encrypted: encryptPayload(payload) }),
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(data?.detail ?? "Request failed");
  }

  return data;
}

export async function mobileLogin(username: string, password: string): Promise<LoginResult> {
  const data = await request("/auth/login", { username, password });

  const result: LoginResult = {
    accessToken: data.access_token,
    user: data.user,
  };

  await storeSession(result);
  return result;
}

export async function mobileRegister(
  username: string,
  email: string,
  password: string,
): Promise<MobileUser> {
  const data = await request("/auth/register", { username, email, password });
  return data as MobileUser;
}

export async function storeSession({ accessToken, user }: LoginResult) {
  const Preferences = await getPreferences();
  if (!Preferences) return;
  await Preferences.set({ key: TOKEN_KEY, value: accessToken });
  await Preferences.set({ key: USER_KEY, value: JSON.stringify(user) });
}

export async function getStoredToken(): Promise<string | null> {
  const Preferences = await getPreferences();
  if (!Preferences) return null;
  const { value } = await Preferences.get({ key: TOKEN_KEY });
  return value;
}

export async function getStoredUser(): Promise<MobileUser | null> {
  const Preferences = await getPreferences();
  if (!Preferences) return null;
  const { value } = await Preferences.get({ key: USER_KEY });
  return value ? (JSON.parse(value) as MobileUser) : null;
}

export async function mobileLogout() {
  const Preferences = await getPreferences();
  if (!Preferences) return;
  await Preferences.remove({ key: TOKEN_KEY });
  await Preferences.remove({ key: USER_KEY });
}
