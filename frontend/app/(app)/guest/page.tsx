'use client'
import { useLayoutEffect } from "react";
import { useAppSession } from "@/lib/use-app-session";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Routes, hasAccess } from "@/config/routes";

export default function GuestPage() {
  const { data: session, status } = useAppSession();
  const router = useRouter();
  const userRole = session?.user?.role ?? 'guest';

  useLayoutEffect(() => {
    if (status === "unauthenticated") {
      router.push(Routes.LOGIN);
    }

    if (status === "authenticated" && !hasAccess(userRole, ['guest', 'admin'])) {
      router.push(Routes.RBAC_TESTS);
    }
  }, [status, router, userRole]);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (status === "unauthenticated" || !hasAccess(userRole, ['guest', 'admin'])) {
    return null;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <main className="flex w-full max-w-3xl flex-col items-center gap-8 px-16 py-32">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-foreground">Guest Page</h1>
          <p className="mt-2 text-muted-foreground">
            Welcome, {session?.user?.name ?? 'Guest'}!
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Role: <span className="font-semibold text-foreground capitalize">{userRole}</span>
          </p>
        </div>

        <div className="w-full rounded-lg border border-border bg-card p-6 text-center">
          <p className="text-sm text-muted-foreground">
            This page is accessible to users with guest or admin roles.
          </p>
        </div>

        <Link href={Routes.RBAC_TESTS}>
          <Button variant="outline" className="cursor-pointer">
            Back to RBAC Tests
          </Button>
        </Link>
      </main>
    </div>
  );
}
