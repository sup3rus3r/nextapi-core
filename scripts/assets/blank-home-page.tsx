import Link from "next/link"
import { Terminal, Sparkles, ArrowRight } from "lucide-react"

// This replaced the starter's Docs page when you ran `npm run init:blank`.
// It's just a placeholder - edit or replace this file with your own content,
// or point Routes.DOCS in frontend/config/routes.ts at a different route
// entirely once you've installed something real.
export default function Home() {
  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col items-start justify-center gap-6 px-6 py-24">
      <p className="font-mono text-xs font-semibold tracking-widest text-brand uppercase">Blank slate</p>
      <h1 className="text-3xl font-bold tracking-tight text-foreground">This page is yours.</h1>
      <p className="text-sm leading-relaxed text-muted-foreground">
        You picked the blank starter template, so the demo Docs/Admin/Guest pages that normally ship here
        were removed. This file - <code className="rounded bg-card px-1.5 py-0.5 font-mono text-foreground">frontend/app/(app)/home/page.tsx</code> -
        is your default landing page after login. Replace it with whatever you're building.
      </p>

      <div className="flex w-full flex-col gap-3 rounded-lg border border-border bg-card p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Terminal className="size-4 text-brand" />
          Build it up from the registry instead
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Install a real feature and let it wire in its own route, backend, and RBAC:
        </p>
        <pre className="overflow-x-auto rounded-lg border border-border bg-background p-3 font-mono text-xs text-foreground">
          nextapi add @scope/module-name{"\n"}nextapi sync
        </pre>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Or describe what you want and let the AI Builder generate it for you.
        </p>
        <Link
          href="https://www.nextapi.app"
          target="_blank"
          rel="noopener noreferrer"
          className="group inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-brand hover:text-brand/80"
        >
          <Sparkles className="size-3.5" />
          Open the registry
          <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </div>
  )
}
