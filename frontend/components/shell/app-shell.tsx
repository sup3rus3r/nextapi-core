"use client"

import { SidebarShell } from "@/components/shell/sidebar-shell"
import { NavbarShell } from "@/components/shell/navbar-shell"
import { getAccessibleRoutes } from "@/config/routes"
import { useAppSession } from "@/lib/use-app-session"

/** Which shell a project uses is a build-time/env choice, not a runtime
 * toggle a logged-in user can flip - set NEXT_PUBLIC_APP_SHELL=navbar to
 * use the top navbar instead of the default sidebar. Read once here and
 * rendered accordingly; every installed module's page renders as
 * `children` inside whichever shell is active. */
export type AppShellKind = "sidebar" | "navbar"

function resolveShellKind(): AppShellKind {
  return process.env.NEXT_PUBLIC_APP_SHELL === "navbar" ? "navbar" : "sidebar"
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useAppSession()
  const shellKind = resolveShellKind()
  const routes = getAccessibleRoutes(session?.user?.role)

  if (status !== "authenticated") {
    return <>{children}</>
  }

  if (shellKind === "navbar") {
    return (
      <NavbarShell routes={routes} userName={session?.user?.name}>
        {children}
      </NavbarShell>
    )
  }

  return (
    <SidebarShell routes={routes} userName={session?.user?.name} userEmail={session?.user?.email}>
      {children}
    </SidebarShell>
  )
}
