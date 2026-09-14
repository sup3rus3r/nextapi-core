"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { motion, AnimatePresence } from "motion/react"
import { LogOut, Menu, X } from "lucide-react"
import { LogoMark } from "@/components/logo"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/theme-toggle"
import { cn } from "@/lib/utils"
import type { RouteConfig } from "@/config/routes"
import { appSignOut } from "@/lib/use-app-session"

interface NavbarShellProps {
  routes: RouteConfig[]
  userName?: string | null
  children: React.ReactNode
}

/** The other env-selectable app shell (see AppShell) - a horizontal top
 * navbar. animate-ui has no single drop-in navbar component (only a
 * Sidebar, per its real registry - confirmed before building this), so this
 * is hand-built from its lower-level primitives (Motion for the animated
 * active-link indicator and the mobile menu transition), matching the same
 * role-filtered route list every shell option renders. */
export function NavbarShell({ routes, userName, children }: NavbarShellProps) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2">
              <LogoMark className="size-6" />
              <span className="text-sm font-semibold">nextapi</span>
            </Link>
            <nav className="hidden items-center gap-1 md:flex">
              {routes.map((route) => {
                const isActive = pathname === route.path
                return (
                  <Link
                    key={route.path}
                    href={route.path}
                    className={cn(
                      "relative px-3 py-1.5 text-sm font-medium transition-colors",
                      isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {route.label}
                    {isActive && (
                      <motion.div
                        layoutId="navbar-active-indicator"
                        className="absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-brand"
                        transition={{ type: "spring", stiffness: 500, damping: 35 }}
                      />
                    )}
                  </Link>
                )
              })}
            </nav>
          </div>

          <div className="hidden items-center gap-2 md:flex">
            <ThemeToggle />
            {userName && <span className="text-sm text-muted-foreground">{userName}</span>}
            <Button onClick={() => appSignOut()} variant="outline" size="sm" className="cursor-pointer gap-1.5">
              <LogOut className="size-3.5" />
              Sign out
            </Button>
          </div>

          <button
            onClick={() => setMobileOpen((v) => !v)}
            className="flex size-9 cursor-pointer items-center justify-center rounded-md text-foreground md:hidden"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>

        <AnimatePresence>
          {mobileOpen && (
            <motion.nav
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden border-t border-border md:hidden"
            >
              <div className="flex flex-col gap-1 px-4 py-3">
                {routes.map((route) => (
                  <Link
                    key={route.path}
                    href={route.path}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "rounded-md px-3 py-2 text-sm font-medium",
                      pathname === route.path ? "bg-accent text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {route.label}
                  </Link>
                ))}
                <button
                  onClick={() => appSignOut()}
                  className="mt-2 flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-3 py-2 text-left text-sm font-medium text-foreground"
                >
                  <LogOut className="size-3.5" />
                  Sign out
                </button>
              </div>
            </motion.nav>
          )}
        </AnimatePresence>
      </header>

      <main className="flex-1">{children}</main>
    </div>
  )
}
