"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useRef } from "react"
import { motion } from "motion/react"
import { BookOpen, ShieldCheck, KeyRound, UserRound, LayoutDashboard, LogOut } from "lucide-react"
import { LogoMark } from "@/components/logo"
import { MenuIcon, type MenuIconHandle } from "@/components/ui/menu"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { ThemeToggle } from "@/components/theme-toggle"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "@/components/animate-ui/components/radix/sidebar"
import type { RouteConfig } from "@/config/routes"
import { appSignOut } from "@/lib/use-app-session"

interface SidebarShellProps {
  routes: RouteConfig[]
  userName?: string | null
  userEmail?: string | null
  userAvatarUrl?: string | null
  children: React.ReactNode
}

const ROUTE_ICONS: Record<string, typeof LayoutDashboard> = {
  "/home": BookOpen,
  "/rbac-tests": KeyRound,
  "/admin": ShieldCheck,
  "/guest": UserRound,
}

/** One of the two env-selectable app shells (see AppShell) - a persistent,
 * collapsible left sidebar built from animate-ui's real Sidebar composition
 * (installed via the shadcn CLI, not hand-rolled). Visual language (avatar,
 * shared-layout active pill via Motion, pill sign-out button, spacing) is
 * matched to the registry's own sidebar (frontend/components/sidebar.tsx
 * there) so core and the registry read as the same product - the registry's
 * version is a fixed-width, always-dark, non-collapsible static panel, which
 * core deliberately does NOT copy: core needs both light/dark and a real
 * icon-collapse mode, neither of which the registry's sidebar has to do. */
export function SidebarShell({ routes, userName, userEmail, userAvatarUrl, children }: SidebarShellProps) {
  const pathname = usePathname()
  const displayName = userName ?? userEmail ?? "Account"
  const initial = displayName.charAt(0).toUpperCase()

  function isActive(path: string) {
    if (path === "/home") return pathname === "/home"
    return pathname === path || pathname.startsWith(`${path}/`)
  }

  return (
    <SidebarProvider style={{ "--sidebar-width": "18rem" } as React.CSSProperties}>
      <Sidebar collapsible="icon" className="overflow-hidden">
        <SidebarHeader>
          <div className="flex items-center justify-end px-2 pt-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
            <AnimatedSidebarTrigger />
          </div>
          <div className="flex items-center justify-center px-2 pt-1">
            <div className="flex items-center gap-2 group-data-[collapsible=icon]:hidden">
              <LogoMark className="size-5 shrink-0" />
              <span className="truncate text-sm font-semibold tracking-tight text-sidebar-foreground">
                nextapi
              </span>
            </div>
          </div>
          <div className="flex flex-col items-center gap-3 px-2 pt-6 pb-6 text-center group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:pt-2 group-data-[collapsible=icon]:pb-2">
            <LogoMark className="hidden size-5 shrink-0 group-data-[collapsible=icon]:block" />
            <Avatar className="size-20 shrink-0 ring-2 ring-sidebar-border transition-[width,height] duration-400 ease-[cubic-bezier(0.75,0,0.25,1)] group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:ring-0">
              {userAvatarUrl && <AvatarImage src={userAvatarUrl} alt={displayName} />}
              <AvatarFallback className="bg-brand font-mono text-2xl font-semibold text-brand-foreground transition-[font-size] duration-400 ease-[cubic-bezier(0.75,0,0.25,1)] group-data-[collapsible=icon]:text-sm">
                {initial}
              </AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-col items-center group-data-[collapsible=icon]:hidden">
              <span className="truncate text-base font-bold text-sidebar-foreground">{displayName}</span>
              {userEmail && (
                <span className="mt-0.5 truncate text-xs text-sidebar-foreground/50">{userEmail}</span>
              )}
            </div>
          </div>
          <SidebarSeparator className="mx-0" />
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup className="px-2 group-data-[collapsible=icon]:px-0">
            <SidebarGroupContent>
              <SidebarMenu className="gap-1.5 group-data-[collapsible=icon]:items-center">
                {routes.map((route) => {
                  const Icon = ROUTE_ICONS[route.path] ?? LayoutDashboard
                  const active = isActive(route.path)
                  return (
                    <SidebarMenuItem key={route.path}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={route.label}
                        className="relative h-auto gap-3.5 rounded-xl px-4 py-3.5 font-semibold data-[active=true]:bg-transparent data-[active=true]:text-sidebar-foreground [&:not([data-highlight])]:data-[active=true]:hover:bg-transparent group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2!"
                      >
                        <Link href={route.path}>
                          {active && (
                            <motion.span
                              layoutId="sidebar-active-pill"
                              className="absolute inset-0 rounded-xl bg-sidebar-accent"
                              transition={{ type: "spring", stiffness: 400, damping: 32 }}
                            />
                          )}
                          <span className={`relative z-10 ${active ? "text-brand" : ""}`}>
                            <Icon className="size-4.5 shrink-0" />
                          </span>
                          <span className="relative z-10">{route.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="gap-3 px-3 pb-3">
          <div className="flex items-center justify-center group-data-[collapsible=icon]:hidden">
            <ThemeToggle className="shrink-0" />
          </div>
          <button
            onClick={() => appSignOut()}
            className="flex w-full shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full bg-brand py-3.5 font-bold text-brand-foreground transition-transform hover:bg-brand/90 active:scale-[0.98] group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:rounded-md group-data-[collapsible=icon]:p-0"
            title="Sign out"
          >
            <LogOut className="size-4 group-data-[collapsible=icon]:size-3.5" />
            <span className="group-data-[collapsible=icon]:hidden">Sign out</span>
          </button>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <div className="flex items-center gap-2 border-b border-border px-4 py-2 md:hidden">
          <SidebarTrigger />
          <LogoMark className="size-5" />
        </div>
        {children}
      </SidebarInset>
    </SidebarProvider>
  )
}

function AnimatedSidebarTrigger() {
  const { toggleSidebar, state } = useSidebar()
  const iconRef = useRef<MenuIconHandle>(null)
  const expanded = state === "expanded"

  useEffect(() => {
    if (expanded) {
      iconRef.current?.startAnimation() // hamburger -> X: click to close
    } else {
      iconRef.current?.stopAnimation() // X -> hamburger: click to open
    }
  }, [expanded])

  return (
    <button
      onClick={toggleSidebar}
      aria-label="Toggle sidebar"
      className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
    >
      <MenuIcon ref={iconRef} size={16} />
    </button>
  )
}
