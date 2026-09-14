'use client'
import { useEffect, useLayoutEffect, useState } from "react";
import { useAppSession } from "@/lib/use-app-session";
import { useRouter } from "next/navigation";
import { GetAPIStatus, GetUserInfo, ToggleUserRole } from "../../api/os";
import { API_HEALTH, USER_DETAILS } from "@/types/os";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import Link from "next/link";
import { Routes, ProtectedRoutes, hasAccess } from "@/config/routes";
import {
  Activity,
  ShieldCheck,
  UserCircle,
  KeyRound,
  ArrowUpRight,
  Lock,
  RefreshCw,
  CheckCircle2,
  XCircle,
} from "lucide-react";

export default function Home() {
  const { data: session, status, refresh } = useAppSession();
  const router = useRouter();
  const [server_status, set_server_status]      = useState<API_HEALTH>({status: "checking..." })
  const [user_info    , set_user_info]          = useState<USER_DETAILS>({id: "", username :"guest", email: "", role: "", auth_type: ""})
  const [isToggling, setIsToggling] = useState(false);
  const userRole = session?.user?.role ?? 'guest'

 useLayoutEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  useEffect(()=>{
    if (status !== "authenticated" || !session?.accessToken) return;

    const fetchStatus = async () => {
      const result = await GetAPIStatus(session.accessToken)
      set_server_status({ status: result?.status ?? "unavailable" })
    }


    fetchStatus()
  }, [status, session?.accessToken])

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Loading...
        </div>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return null;
  }

  const isHealthy = server_status.status === "ok" || server_status.status === "healthy";

  const handleToggleRole = async () => {
    setIsToggling(true);
    try {
      const result = await ToggleUserRole(session?.accessToken);
      if (result) {
        await refresh({
          role: result.user.role,
          accessToken: result.access_token,
        });
      } else {
        window.alert('Failed to toggle role');
      }
    } finally {
      setIsToggling(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Welcome back, {session?.user?.name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Here&apos;s the current state of your session and the API.
          </p>
        </div>

        {/* Status cards */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="flex items-center gap-4 px-6">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${isHealthy ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-amber-500/10 text-amber-600 dark:text-amber-400"}`}>
                <Activity className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Server Health</p>
                <p className="text-sm font-semibold text-foreground">{server_status.status}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center gap-4 px-6">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Role</p>
                <p className="text-sm font-semibold capitalize text-foreground">{userRole}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center gap-4 px-6">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <UserCircle className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">User ID</p>
                <p className="truncate text-sm font-semibold text-foreground" title={session?.user?.id}>
                  {session?.user?.id}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* RBAC test panel */}
        <Card className="mt-6">
          <CardHeader className="px-6">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">RBAC Test</h2>
            </div>
            <p className="text-xs text-muted-foreground">
              These buttons are gated by your current role -try toggling your role below.
            </p>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3 px-6">
            <Button
              variant="outline"
              className="cursor-pointer font-medium"
              disabled={!['admin'].includes(userRole)}
              onClick={()=>{
                window.alert(`${userRole} has clicked this button`)
              }}
            >
              Admin Button
            </Button>
            <Button
              variant="outline"
              className="cursor-pointer font-medium"
              disabled={!['guest','admin'].includes(userRole)}
              onClick={()=>{
                window.alert(`${userRole} has clicked this button`)
              }}
            >
              Guest Button
            </Button>
            <Button
              onClick={handleToggleRole}
              disabled={isToggling}
              variant="outline"
              className="cursor-pointer gap-1.5 font-medium"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isToggling ? "animate-spin" : ""}`} />
              Toggle Role (Current: {userRole})
            </Button>
          </CardContent>
        </Card>

        {/* Route access list */}
        <Card className="mt-6">
          <CardHeader className="px-6">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">Route Access</h2>
            </div>
            <p className="text-xs text-muted-foreground">
              Routes available based on your current role.
            </p>
          </CardHeader>
          <CardContent className="px-6">
            <div className="divide-y divide-border">
              {ProtectedRoutes.filter(route => route.path !== Routes.RBAC_TESTS).map((route) => {
                const canAccess = hasAccess(userRole, route.allowedRoles);
                return (
                  <div key={route.path} className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-2.5">
                      {canAccess ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <XCircle className="h-4 w-4 shrink-0 text-muted-foreground/40" />
                      )}
                      <div>
                        {canAccess ? (
                          <Link
                            className="flex items-center gap-1 text-sm font-medium text-foreground hover:text-brand"
                            href={route.path}
                          >
                            {route.label}
                            <ArrowUpRight className="h-3.5 w-3.5" />
                          </Link>
                        ) : (
                          <span className="text-sm font-medium text-muted-foreground/50">
                            {route.label}
                          </span>
                        )}
                        <p className="text-xs text-muted-foreground/70">requires: {route.allowedRoles.join(', ')}</p>
                      </div>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${canAccess ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-muted-foreground'}`}>
                      {canAccess ? 'Access' : 'Denied'}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Raw session (debug) */}
        <details className="mt-6 rounded-lg border border-border bg-card p-4 text-xs">
          <summary className="cursor-pointer font-medium text-muted-foreground">Raw session payload</summary>
          <pre className="mt-3 overflow-x-auto rounded bg-muted/50 p-3 text-muted-foreground">
            {JSON.stringify(session?.user, null, 2)}
          </pre>
        </details>
      </main>
    </div>
  );
}
