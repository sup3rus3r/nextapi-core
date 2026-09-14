import { Header } from "@/components/header"
import Link from "next/link"
import {
  Blocks,
  Sparkles,
  PackageCheck,
  KeyRound,
  Server,
  Database,
  ShieldCheck,
  Container,
  Smartphone,
  ArrowRight,
  Upload,
  Wand2,
  Download,
} from "lucide-react"
import { HeroTerminal } from "@/components/landing/hero-terminal"
import { FadeIn, FadeInStagger, FadeInStaggerItem } from "@/components/landing/fade-in"

const howItWorks = [
  {
    icon: Download,
    step: "01",
    title: "Install a module",
    description:
      "nextapi add fetches a module from the registry. nextapi sync wires its routes, models, and RBAC into this codebase. No account required for either command.",
  },
  {
    icon: Wand2,
    step: "02",
    title: "Or generate one",
    description:
      "Describe the feature on the registry's AI Builder. It writes the routes, components, and backend wiring, ready to run.",
  },
  {
    icon: Upload,
    step: "03",
    title: "Publish it back",
    description:
      "nextapi login once, then nextapi publish from the module's folder. Anyone can install it from there.",
  },
]

const boilerplateFeatures = [
  {
    icon: KeyRound,
    title: "JWT Authentication",
    description: "Credentials-based auth via NextAuth v5. Payloads are AES-256-CBC encrypted before the JWT is issued.",
    label: "NextAuth v5 / python-jose",
  },
  {
    icon: Server,
    title: "FastAPI Backend",
    description: "An async Python API with Pydantic v2 validation and SQLAlchemy 2.0 session management.",
    label: "FastAPI / SQLAlchemy",
  },
  {
    icon: Database,
    title: "Dual Database Support",
    description: "Runs on SQLite by default. Switch to MongoDB with one environment variable.",
    label: "SQLite / MongoDB",
  },
  {
    icon: ShieldCheck,
    title: "Role-Based Access Control",
    description: "Admin, user, and guest roles are embedded in the JWT and enforced on both the backend and frontend.",
    label: "3-tier RBAC",
  },
  {
    icon: Container,
    title: "Docker Compose Stack",
    description: "Frontend, backend, and an optional nginx reverse proxy with SSL are defined and ready to run.",
    label: "Docker / nginx",
  },
  {
    icon: Smartphone,
    title: "Web and Mobile, One Codebase",
    description: "Bundle the same frontend into native Android and iOS apps with Capacitor, using the same JWT endpoints.",
    label: "Capacitor",
  },
]

export default function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="pointer-events-none absolute inset-0 [background:radial-gradient(circle_at_15%_0%,color-mix(in_oklch,var(--brand)_16%,transparent),transparent_50%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#80808010_1px,transparent_1px),linear-gradient(to_bottom,#80808010_1px,transparent_1px)] bg-size-[32px_32px] mask-[radial-gradient(ellipse_70%_60%_at_20%_0%,black,transparent)]" />

        <div className="relative mx-auto grid max-w-6xl gap-16 px-6 py-24 lg:grid-cols-2 lg:items-center lg:py-32">
          <FadeIn className="flex flex-col items-start gap-6 text-left">
            <p className="flex items-center gap-1.5 font-mono text-xs font-semibold tracking-widest text-brand uppercase">
              <Blocks className="size-3.5" />
              Backed by the NextAPI module registry
            </p>

            <h1 className="max-w-xl text-4xl font-bold tracking-tight text-balance sm:text-5xl">
              A FastAPI and Next.js starter, extended by a module registry.
            </h1>

            <p className="max-w-lg text-base leading-relaxed text-muted-foreground">
              Auth, RBAC, and a dual-database backend, wired up from the start. Install modules from the
              registry with no account required. Generate one with the AI Builder, or publish your own.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Link
                href="/register"
                className="group inline-flex items-center gap-1.5 bg-brand px-6 py-2.5 text-sm font-semibold text-brand-foreground transition hover:bg-brand/90"
              >
                Get Started
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/login"
                className="border border-border px-6 py-2.5 text-sm font-semibold text-foreground transition hover:bg-accent"
              >
                Sign In
              </Link>
            </div>
          </FadeIn>

          <HeroTerminal />
        </div>
      </section>

      {/* How it works - the registry story */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <FadeIn className="mb-14 max-w-xl">
          <p className="font-mono text-xs font-semibold tracking-widest text-brand uppercase">The module registry</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight">Extend the app by installing modules</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            A module is a full-stack feature: frontend routes, backend logic, and a database model, declared
            in one manifest. Install modules with no account required, or publish your own for others to
            install.
          </p>
        </FadeIn>

        <FadeInStagger className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3">
          {howItWorks.map((step) => (
            <FadeInStaggerItem key={step.title} className="group flex flex-col gap-4 bg-background p-8 transition-colors hover:bg-card/60">
              <div className="flex items-center justify-between">
                <div className="flex size-10 items-center justify-center rounded-lg bg-brand/10 text-brand transition-transform duration-300 group-hover:scale-110">
                  <step.icon className="size-5" />
                </div>
                <span className="font-mono text-xs text-muted-foreground/50">{step.step}</span>
              </div>
              <div>
                <h3 className="font-semibold text-foreground">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.description}</p>
              </div>
            </FadeInStaggerItem>
          ))}
        </FadeInStagger>

        <FadeIn delay={0.15} className="mt-6 flex items-center justify-between gap-4 overflow-hidden rounded-xl border border-border bg-card p-6">
          <div className="flex min-w-0 items-center gap-3">
            <PackageCheck className="size-5 shrink-0 text-brand" />
            <p className="truncate text-sm text-muted-foreground">
              Every module declares its own routes and RBAC. nextapi sync adds it to your sidebar.
            </p>
          </div>
          <Link
            href="https://www.nextapi.app"
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-brand hover:text-brand/80"
          >
            Explore the registry
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </FadeIn>
      </section>

      {/* Boilerplate features - what's included out of the box */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <FadeIn className="mb-14 flex items-end justify-between gap-4">
          <div className="max-w-xl">
            <p className="font-mono text-xs font-semibold tracking-widest text-brand uppercase">Out of the box</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight">What's included</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              The foundation every installed module builds on.
            </p>
          </div>
          <Sparkles className="hidden size-8 shrink-0 text-brand/30 sm:block" />
        </FadeIn>

        <FadeInStagger className="grid border-t border-l border-border sm:grid-cols-2 lg:grid-cols-3">
          {boilerplateFeatures.map((f, i) => (
            <FadeInStaggerItem
              key={f.title}
              className="group relative border-r border-b border-border p-7 transition hover:bg-card/40"
            >
              <span className="font-mono text-xs text-muted-foreground/50">{String(i + 1).padStart(2, "0")}</span>
              <div className="mt-4 mb-4 flex size-9 items-center justify-center border border-border text-muted-foreground transition group-hover:border-brand/40 group-hover:text-brand">
                <f.icon className="h-4.5 w-4.5" />
              </div>
              <h3 className="font-semibold text-foreground">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.description}</p>
              <span className="mt-4 inline-block font-mono text-[11px] text-brand/80">
                {f.label}
              </span>
            </FadeInStaggerItem>
          ))}
        </FadeInStagger>
      </section>

      <footer className="border-t border-border py-8 text-center font-mono text-xs tracking-wide text-muted-foreground">
        NextAPI ·{" "}
        <a
          href="https://www.nextapi.app"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-brand"
        >
          nextapi.app
        </a>
      </footer>
    </div>
  )
}
