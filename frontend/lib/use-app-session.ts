"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { platform } from "@/lib/platform";
import { getStoredToken, getStoredUser, type MobileUser } from "@/lib/mobile-auth";

export type SessionStatus = "loading" | "authenticated" | "unauthenticated";

export interface AppSession {
  accessToken?: string;
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
    role?: string;
  };
}

interface UseAppSessionResult {
  data: AppSession | null;
  status: SessionStatus;
}

/**
 * Drop-in replacement for next-auth's useSession() that also works in the
 * Capacitor build, where there's no Next.js server to back NextAuth. Web
 * keeps using the real NextAuth session; native reads the JWT + user that
 * lib/mobile-auth.ts stored at login.
 */
interface UseAppSessionReturn extends UseAppSessionResult {
  /** Re-reads the session after it changes underneath the app (e.g. a role toggle). */
  refresh: (update?: { accessToken?: string; role?: string }) => Promise<void>;
}

export function useAppSession(): UseAppSessionReturn {
  const nextAuthSession = useSession();
  const [mobileState, setMobileState] = useState<UseAppSessionResult>({
    data: null,
    status: "loading",
  });

  async function loadMobile() {
    const [token, user] = await Promise.all([getStoredToken(), getStoredUser()]);

    if (!token || !user) {
      setMobileState({ data: null, status: "unauthenticated" });
      return;
    }

    setMobileState({
      data: {
        accessToken: token,
        user: { id: user.id, name: user.username, email: user.email, role: user.role },
      },
      status: "authenticated",
    });
  }

  useEffect(() => {
    if (platform.isNative) loadMobile();
  }, []);

  async function refresh(update?: { accessToken?: string; role?: string }) {
    if (platform.isNative) {
      if (update) {
        const user = await getStoredUser();
        const token = update.accessToken ?? (await getStoredToken());
        if (user && token) {
          const { storeSession } = await import("@/lib/mobile-auth");
          await storeSession({
            accessToken: token,
            user: { ...user, role: update.role ?? user.role },
          });
        }
      }
      await loadMobile();
      return;
    }
    await nextAuthSession.update(update);
  }

  if (platform.isNative) {
    return { ...mobileState, refresh };
  }

  return {
    data: nextAuthSession.data
      ? {
          accessToken: nextAuthSession.data.accessToken,
          user: {
            id: nextAuthSession.data.user.id,
            name: nextAuthSession.data.user.name,
            email: nextAuthSession.data.user.email,
            role: nextAuthSession.data.user.role,
          },
        }
      : null,
    status: nextAuthSession.status,
    refresh,
  };
}

export async function appSignOut() {
  if (platform.isNative) {
    const { mobileLogout } = await import("@/lib/mobile-auth");
    await mobileLogout();
    return;
  }
  const { signOut } = await import("next-auth/react");
  await signOut({ callbackUrl: "/login" });
}
