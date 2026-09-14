"use client"

import { useState } from "react"
import {
  Terminal,
  BookOpen,
  Package,
  ShieldCheck,
  GitBranch,
  Copy,
  Check,
  KeyRound,
  Server,
  Database,
  Smartphone,
  Layers,
  Link2,
} from "lucide-react"

const SECTIONS = [
  { id: "whats-included", label: "What's included", icon: Layers },
  { id: "auth", label: "Auth & RBAC", icon: ShieldCheck },
  { id: "using-modules", label: "Using modules", icon: Terminal },
  { id: "collection-linking", label: "Collection linking", icon: Link2 },
  { id: "publishing-modules", label: "Publishing modules", icon: KeyRound },
  { id: "cli-reference", label: "CLI reference", icon: BookOpen },
  { id: "manifest", label: "module.json", icon: Package },
  { id: "versioning", label: "Versions", icon: GitBranch },
]

function CopyableCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(command)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <button
      onClick={handleCopy}
      className="group flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 text-left font-mono text-sm text-foreground outline-none transition-colors hover:border-foreground/20 focus-visible:ring-2 focus-visible:ring-brand/50"
    >
      <span>
        <span className="text-brand">$</span> {command}
      </span>
      {copied ? (
        <Check className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
      ) : (
        <Copy className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
      )}
    </button>
  )
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg border border-border bg-card p-4 font-mono text-xs leading-relaxed text-foreground">
      <code>{children}</code>
    </pre>
  )
}

function Pill({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "brand" }) {
  const toneClasses =
    tone === "brand"
      ? "border-brand/30 bg-brand/10 text-brand"
      : "border-border bg-muted text-muted-foreground"
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[11px] ${toneClasses}`}>
      {children}
    </span>
  )
}

function Section({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string
  eyebrow: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-24 border-b border-border py-16 first:pt-0 last:border-b-0">
      <p className="font-mono text-xs font-medium tracking-wide text-brand uppercase">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{title}</h2>
      <div className="mt-8 flex flex-col gap-6 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  )
}

const WHATS_INCLUDED = [
  {
    icon: KeyRound,
    title: "JWT authentication",
    body: "Login and registration via NextAuth v5. Payloads are AES-256-CBC encrypted client-side, decrypted on the backend, then exchanged for a signed JWT with the user id, username, and role.",
  },
  {
    icon: Server,
    title: "FastAPI backend",
    body: "An async Python API with Pydantic v2 validation and SQLAlchemy 2.0 session management.",
  },
  {
    icon: Database,
    title: "SQLite or MongoDB",
    body: "Runs on SQLite by default, file-backed, no config. Set DATABASE_TYPE=mongo to switch.",
  },
  {
    icon: KeyRound,
    title: "API client tokens",
    body: "Machine-to-machine auth via X-API-Key / X-API-Secret headers. Clients are stored with a bcrypt-hashed secret, minted from your own account.",
  },
  {
    icon: Smartphone,
    title: "Web and mobile, one codebase",
    body: "npm run add:mobile bundles the same frontend into native Android and iOS apps with Capacitor. Web keeps its NextAuth session; mobile authenticates against the same JWT endpoints.",
  },
  {
    icon: Layers,
    title: "A configurable app shell",
    body: "Every authenticated page renders inside a sidebar or a top navbar, set once at build time with NEXT_PUBLIC_APP_SHELL. Both read nav items from the same route registry modules extend automatically.",
  },
]

const MANIFEST_FIELDS: { field: string; type: string; required?: boolean; description: string }[] = [
  { field: "id", type: "string", required: true, description: "The module's unique name. Plain names like \"profile-page\" are reserved for official modules, everyone else uses a scoped name like \"@alice/profile-page\"." },
  { field: "version", type: "semver", required: true, description: "A version number in MAJOR.MINOR.PATCH form, optionally with a -prerelease tag. Once published, a version can't be changed." },
  { field: "nextapiVersion", type: "range", required: true, description: "Which app versions this module works with, e.g. \">=1.0.0 <2.0.0\"." },
  { field: "displayName", type: "string", description: "The name shown in the registry." },
  { field: "description", type: "string", description: "Shown in search results and on the module's page." },
  { field: "category", type: "string", description: "A grouping used for browsing, e.g. \"core\", \"ai\", \"auth\"." },
  { field: "requires.modules", type: "string[]", description: "Other modules this one needs, written as \"id@range\", e.g. \"profile-page@^1.0.0\"." },
  { field: "shareable", type: "boolean", description: "Defaults to true. Set false only if this module can safely run as more than one installed version at once - see Versions below." },
  { field: "env.backend / env.frontend", type: "object[]", description: "Environment variables the module needs, added to your .env files automatically on install." },
  { field: "dependencies.frontend.npm / .backend.pypi", type: "object", description: "Any npm or Python packages the module needs, added automatically on install." },
  { field: "frontend.routes", type: "object[]", description: "The pages this module adds: path, source folder, whether it needs sign-in, and who can see it." },
  { field: "backend.router", type: "object", description: "Where the module's server-side code lives and which URL prefix it responds to." },
  { field: "backend.collection", type: "string", description: "The database collection this module stores its data in. If this names a collection the host already owns (e.g. \"users\") and your model's fields are compatible, sync offers to link to the real data instead of creating a duplicate - see Collection linking below." },
  { field: "schemaVersion", type: "integer", description: "Only meaningful alongside backend.collection. Bump it when the shape of an already-stored document changes, separately from version - see Versions below." },
  { field: "functions.uses / functions.provides", type: "string[]", description: "Functions this module calls from other modules, or makes available for others to call." },
  { field: "postInstall.message", type: "string", description: "A message shown after the module is installed, handy for any manual setup steps." },
]

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto max-w-6xl px-6 py-16 sm:px-10">
        <p className="font-mono text-xs font-medium tracking-wide text-brand uppercase">Documentation</p>
        <h1 className="mt-4 max-w-2xl text-4xl font-bold tracking-tight text-balance sm:text-5xl">
          Reference for this project and its CLI
        </h1>
        <p className="mt-4 max-w-lg text-base leading-relaxed text-muted-foreground">
          Auth, RBAC, and a dual-database backend are wired up by default. The CLI installs additional
          features from a module registry, or publishes your own.
        </p>

        <div className="mt-12 grid grid-cols-1 gap-10 lg:grid-cols-[220px_1fr]">
          <nav className="hidden self-start lg:sticky lg:top-20 lg:block">
            <ul className="flex flex-col gap-1 border-l border-border pl-4">
              {SECTIONS.map((s) => {
                const Icon = s.icon
                return (
                  <li key={s.id}>
                    <a
                      href={`#${s.id}`}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand/50"
                    >
                      <Icon className="size-3.5 shrink-0 text-muted-foreground/60" />
                      {s.label}
                    </a>
                  </li>
                )
              })}
            </ul>
          </nav>

          <div className="min-w-0">
            <div className="mb-8 flex flex-wrap gap-2 lg:hidden">
              {SECTIONS.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-foreground/20"
                >
                  {s.label}
                </a>
              ))}
            </div>

            <Section id="whats-included" eyebrow="00 · Overview" title="What's included out of the box">
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                {WHATS_INCLUDED.map((item) => (
                  <div key={item.title} className="rounded-xl border border-border bg-card p-5">
                    <item.icon className="size-4 text-brand" />
                    <h3 className="mt-3 text-sm font-semibold text-foreground">{item.title}</h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{item.body}</p>
                  </div>
                ))}
              </div>
            </Section>

            <Section id="auth" eyebrow="01 · How it works" title="Auth and RBAC">
              <p>
                Registration and login payloads are encrypted client-side and decrypted on the backend
                before processing. A successful login returns a signed JWT with the user id, username, and
                role.
              </p>
              <p>
                Role-based access control is enforced on the frontend. The route registry at{" "}
                <code className="text-foreground">frontend/config/routes.ts</code> declares which roles can
                see which pages; the sidebar or navbar shows only what the current role can access. This is
                UI-level gating, not a server-side authorization boundary. Enforce role checks in the
                backend route itself for any endpoint that needs one.
              </p>
              <div className="rounded-xl border border-border bg-card p-5">
                <p className="text-sm font-semibold text-foreground">API client tokens</p>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                  For machine-to-machine access, mint an API client instead of sharing a user&apos;s
                  session. It authenticates with an <code className="text-foreground">X-API-Key</code> /{" "}
                  <code className="text-foreground">X-API-Secret</code> header pair. The secret is shown
                  once, at creation time.
                </p>
              </div>
            </Section>

            <Section id="using-modules" eyebrow="02 · Quickstart" title="Using modules">
              <p>
                Browsing and installing modules requires no account, token, or sign-in.
              </p>

              <div className="flex flex-col gap-3">
                <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">0. Point the CLI at a registry</p>
                <p>
                  The CLI ships in this repo at <code className="text-foreground">scripts/nextapi-cli/</code>,
                  run via <code className="text-foreground">npm run nextapi</code>. Set{" "}
                  <code className="text-foreground">NEXTAPI_REGISTRY_URL</code> to the registry to install
                  from and publish to, e.g.{" "}
                  <a
                    href="https://www.nextapi.app"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand hover:text-brand/80"
                  >
                    nextapi.app
                  </a>
                  , the official module registry.
                </p>
              </div>

              <div className="flex flex-col gap-3">
                <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">1. Add a module</p>
                <p>
                  Records the module in your project&apos;s lockfile. No login required:
                </p>
                <CopyableCommand command="npm run nextapi -- add profile-page@^1.0.0" />
              </div>

              <div className="flex flex-col gap-3">
                <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">2. Install it</p>
                <p>
                  Fetches and installs everything you&apos;ve added, including on a machine that has never
                  seen the module before:
                </p>
                <CopyableCommand command="npm run nextapi -- sync" />
                <p>
                  Transitive dependencies are fetched automatically. Once synced, a module&apos;s routes and
                  nav entry appear in your sidebar or navbar with no manual wiring.
                </p>
              </div>

              <div className="rounded-xl border border-border bg-card p-5">
                <p className="text-sm text-foreground">
                  Publishing is a separate flow that requires an account on the target registry, covered
                  next.
                </p>
              </div>
            </Section>

            <Section id="collection-linking" eyebrow="02.5 · How it works" title="Linking modules to your real collections">
              <p>
                A module can declare a Mongo collection (e.g. <code className="text-foreground">&quot;users&quot;</code>)
                that overlaps with a collection this starter already owns. Without any special handling, that
                module would create its own, separate <code className="text-foreground">users</code> collection -
                one with no connection to who can actually log into your app.
              </p>
              <p>
                <code className="text-foreground">sync</code> checks for this at install time. If a module&apos;s
                own model fields are compatible with a host collection it names, it offers to link the module to
                the real data instead of creating a duplicate:
              </p>
              <CodeBlock>{`'@alice/user-management' declares a "users" collection compatible with your
existing UserCollection. Link it instead of creating a separate collection? (y/N)`}</CodeBlock>
              <p>
                Confirm and the module&apos;s generated code is rewritten to call your real{" "}
                <code className="text-foreground">UserCollection</code> - no second collection, no drift between
                &quot;users the module knows about&quot; and &quot;users who can sign in.&quot; Pass{" "}
                <code className="text-foreground">--yes</code> to confirm automatically for non-interactive runs.
              </p>
              <div className="rounded-xl border border-border bg-card p-5">
                <p className="text-sm font-semibold text-foreground">When the fields don&apos;t match</p>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                  Sync doesn&apos;t fail. The module installs against its own collection exactly as it always
                  would, and an end-of-run report names precisely which fields the module expects that the
                  host collection doesn&apos;t have (or has with a different type) - something concrete for the
                  module&apos;s author to fix and republish.
                </p>
              </div>
              <p>
                The decision is remembered. Installing a new version of an already-linked module re-links it
                automatically - you&apos;re not asked again every time you update. If a new version&apos;s
                schema stops matching, it falls back to its own collection instead of staying linked to
                something it no longer fits, and sync warns you explicitly: anything the module already wrote
                through the link stays in your real collection, but new writes go to its own until it&apos;s
                re-linked.
              </p>
              <p>
                This only recognizes collections this starter itself ships (currently just{" "}
                <code className="text-foreground">users</code>, in{" "}
                <code className="text-foreground">scripts/nextapi-cli/lib/hostCollections.mjs</code>) - a module
                targeting anything else installs exactly as it always has.
              </p>
              <p>
                Matching fields isn&apos;t the whole story. A module can also call methods on its collection
                class (<code className="text-foreground">UserCollection.count(...)</code>,{" "}
                <code className="text-foreground">.list_page(...)</code>) that your real{" "}
                <code className="text-foreground">UserCollection</code> doesn&apos;t have. When that happens,
                sync copies the module&apos;s own implementation of exactly those methods into your real{" "}
                <code className="text-foreground">models_mongo.py</code> - purely additive, never touching or
                overwriting a method your host already has, since something else (like{" "}
                <code className="text-foreground">/auth/register</code>) may already depend on it behaving
                exactly as it does today:
              </p>
              <CodeBlock>{`Linked '@alice/user-management' to your existing UserCollection.
  Adopted into UserCollection: count, list_page
  (these are now part of your host's UserCollection - inspect backend/models_mongo.py)`}</CodeBlock>
              <p>
                Field compatibility also can&apos;t catch data that predates the field: your{" "}
                <code className="text-foreground">users</code> collection may hold documents written before a
                field existed on your model, especially if that model was never enforced on every write path.
                Sync samples your actual MongoDB collection at link time and, if a field your model declares
                required is missing from real, existing documents, asks explicit consent before demoting that
                field to optional in your host&apos;s schema:
              </p>
              <CodeBlock>{`'users' collection: 'created_at' is declared required, but missing from
214/1,048 existing documents. Demote 'created_at' to optional in your
host's UserMongo model to match reality? (y/N)`}</CodeBlock>
              <div className="rounded-xl border border-border bg-card p-5">
                <p className="text-sm font-semibold text-foreground">Declining a demotion</p>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                  Aborts the entire link for that module - nothing is written to{" "}
                  <code className="text-foreground">models_mongo.py</code>, and the module falls back to its own
                  separate collection, same as an incompatible-fields case. This check needs your backend&apos;s
                  Mongo reachable from the machine running sync; if it isn&apos;t, sync skips it silently and
                  links exactly as it would have before this check existed.
                </p>
              </div>
              <div className="rounded-xl border border-border bg-card p-5">
                <p className="text-sm font-semibold text-foreground">Building a module that manages users?</p>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                  Match the host&apos;s real field names and types up front - a model with{" "}
                  <code className="text-foreground">username</code>, <code className="text-foreground">email</code>,{" "}
                  <code className="text-foreground">role</code>, and{" "}
                  <code className="text-foreground">hashed_password</code> links cleanly instead of falling through
                  to its own disconnected collection. And once linked, don&apos;t assume every existing document
                  has every field: read anything sourced from a host-owned collection with{" "}
                  <code className="text-foreground">doc.get(&quot;field&quot;)</code>, not{" "}
                  <code className="text-foreground">doc[&quot;field&quot;]</code>, and type it{" "}
                  <code className="text-foreground">Optional[...]</code> in your response schema - the host&apos;s
                  real data can predate your module by years.
                </p>
              </div>
              <p>
                Installing a public module that doesn&apos;t link? Fork it - by hand, or by handing the
                field-mismatch report to the AI Builder and asking it to update the module&apos;s model to match -
                then republish. A module that links correctly once keeps linking for everyone who installs it
                after you.
              </p>
            </Section>

            <Section id="publishing-modules" eyebrow="03 · Quickstart" title="Publishing modules">
              <p>
                Publishing requires an account on the target registry. An access token authenticates the
                CLI.
              </p>

              <div className="flex flex-col gap-3">
                <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">1. Create a token</p>
                <p>
                  Mint a <code className="text-foreground">client_id:client_secret</code> token from the
                  registry&apos;s account settings (
                  <a
                    href="https://www.nextapi.app/settings/tokens"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand hover:text-brand/80"
                  >
                    nextapi.app/settings/tokens
                  </a>
                  , for the official registry), then pass it to the CLI:
                </p>
                <CopyableCommand command="npm run nextapi -- login" />
              </div>

              <div className="flex flex-col gap-3">
                <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">2. Publish a module</p>
                <p>
                  Run from inside a folder containing a <code className="text-foreground">module.json</code>.
                  Validates the manifest, bundles the folder, and uploads it as a new version:
                </p>
                <CopyableCommand command="npm run nextapi -- publish" />
                <p>
                  The first publish of an id registers it to your account. Only you can publish new
                  versions of it after that.
                </p>
              </div>
            </Section>

            <Section id="cli-reference" eyebrow="04 · Reference" title="CLI reference">
              <div className="flex flex-col gap-2">
                <code className="w-fit rounded bg-muted px-2 py-1 font-mono text-sm text-foreground">npm run nextapi -- login</code>
                <p>Saves a <code className="text-foreground">client_id:client_secret</code> token to <code className="text-foreground">.nextapi/auth.json</code>. Run once per machine.</p>
              </div>

              <div className="flex flex-col gap-2 border-t border-border pt-6">
                <code className="w-fit rounded bg-muted px-2 py-1 font-mono text-sm text-foreground">npm run nextapi -- publish [dir]</code>
                <p>Publishes the module in <code className="text-foreground">dir</code> (defaults to the current folder) as a new version. Once a version is published it can&apos;t be changed, publish a new version number instead.</p>
              </div>

              <div className="flex flex-col gap-2 border-t border-border pt-6">
                <code className="w-fit rounded bg-muted px-2 py-1 font-mono text-sm text-foreground">npm run nextapi -- add &lt;id | id@range | path&gt;</code>
                <p>Adds a module to your project. Three ways to call it:</p>
                <ul className="ml-4 flex list-disc flex-col gap-1.5">
                  <li><code className="text-foreground">add profile-page</code>: get the latest version.</li>
                  <li><code className="text-foreground">add profile-page@^1.0.0</code>: get a specific version or range.</li>
                  <li><code className="text-foreground">add ./my-local-module</code>: add a module from a folder on your own machine.</li>
                </ul>
              </div>

              <div className="flex flex-col gap-2 border-t border-border pt-6">
                <code className="w-fit rounded bg-muted px-2 py-1 font-mono text-sm text-foreground">npm run nextapi -- sync</code>
                <p>Installs everything you&apos;ve added. Transitive dependencies are fetched and installed automatically.</p>
              </div>

              <div className="flex flex-col gap-2 border-t border-border pt-6">
                <code className="w-fit rounded bg-muted px-2 py-1 font-mono text-sm text-foreground">npm run nextapi -- remove &lt;id&gt; [--force] [--purge-env]</code>
                <p>Removes a module. If you&apos;ve edited its files yourself, it asks you to confirm with <code className="text-foreground">--force</code>. Add <code className="text-foreground">--purge-env</code> to also clean up any environment variables it added.</p>
              </div>

              <div className="flex flex-col gap-2 border-t border-border pt-6">
                <code className="w-fit rounded bg-muted px-2 py-1 font-mono text-sm text-foreground">npm run nextapi -- list</code>
                <p>Shows everything installed, and flags anything that&apos;s been changed since it was set up.</p>
              </div>

              <div className="flex flex-col gap-2 border-t border-border pt-6">
                <code className="w-fit rounded bg-muted px-2 py-1 font-mono text-sm text-foreground">npm run nextapi -- validate [dir]</code>
                <p>Checks a <code className="text-foreground">module.json</code> for common problems before you ever publish it - no network call.</p>
              </div>
            </Section>

            <Section id="manifest" eyebrow="05 · Schema" title="The module.json manifest">
              <p>Every module is described by a single manifest file at its root. Here&apos;s a real one:</p>
              <CodeBlock>{`{
  "id": "ai-notes",
  "version": "1.0.0",
  "nextapiVersion": ">=1.0.0 <2.0.0",
  "displayName": "AI Notes",
  "description": "Adds a protected /notes page...",
  "category": "ai",
  "requires": { "modules": ["profile-page@^1.0.0"] },
  "env": {
    "backend": [
      { "key": "ANTHROPIC_API_KEY", "required": true, "secret": true }
    ]
  },
  "dependencies": {
    "frontend": { "npm": { "react-markdown": "^9.0.0" } },
    "backend": { "pypi": { "anthropic": "^0.40.0" } }
  },
  "frontend": {
    "routes": [{ "path": "/notes", "protected": true, "label": "Notes" }]
  },
  "backend": {
    "router": { "module": "backend/router.py", "attr": "router", "prefix": "/notes" }
  },
  "postInstall": { "message": "Set ANTHROPIC_API_KEY, then run \`npm run nextapi -- sync\`." }
}`}</CodeBlock>

              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="px-4 py-2.5 font-semibold text-foreground">Field</th>
                      <th className="px-4 py-2.5 font-semibold text-foreground">Type</th>
                      <th className="px-4 py-2.5 font-semibold text-foreground">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {MANIFEST_FIELDS.map((f) => (
                      <tr key={f.field} className="border-b border-border last:border-b-0">
                        <td className="px-4 py-3 align-top font-mono text-xs whitespace-nowrap text-foreground">
                          {f.field}
                          {f.required && <span className="ml-1.5 text-brand">*</span>}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <Pill>{f.type}</Pill>
                        </td>
                        <td className="px-4 py-3 align-top text-muted-foreground">{f.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground"><span className="text-brand">*</span> Required.</p>
            </Section>

            <Section id="versioning" eyebrow="06 · Versions" title="Versions and updates">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-border bg-card p-5">
                  <h3 className="text-sm font-semibold text-foreground">Version numbers</h3>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Every version needs a proper number in <code className="text-foreground">MAJOR.MINOR.PATCH</code> form,
                    optionally with a <code className="text-foreground">-prerelease</code> tag.
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-card p-5">
                  <h3 className="text-sm font-semibold text-foreground">Once published, it&apos;s final</h3>
                  <p className="mt-2 text-xs text-muted-foreground">You can&apos;t change or replace <code className="text-foreground">1.2.0</code> after it&apos;s out, publish a new version instead.</p>
                </div>
              </div>

              <p>When you need a specific version of a module, or a module depends on one, you can write it as:</p>
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full border-collapse text-left text-sm">
                  <tbody>
                    <tr className="border-b border-border">
                      <td className="px-4 py-2.5 font-mono text-xs text-foreground">^1.2.0</td>
                      <td className="px-4 py-2.5 text-muted-foreground">Anything compatible with 1.2.0: same major version, same or newer.</td>
                    </tr>
                    <tr className="border-b border-border">
                      <td className="px-4 py-2.5 font-mono text-xs text-foreground">&gt;=1.0.0 &lt;2.0.0</td>
                      <td className="px-4 py-2.5 text-muted-foreground">Anything within a specific range.</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2.5 font-mono text-xs text-foreground">(nothing)</td>
                      <td className="px-4 py-2.5 text-muted-foreground">Just get the latest version.</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <h3 className="text-lg font-semibold text-foreground">When two modules need different versions</h3>
              <p>
                By default, every module keeps exactly one installed version at a time.{" "}
                <code className="text-foreground">nextapi sync</code> resolves compatible-but-different ranges to
                one shared version automatically, and only surfaces a real conflict - naming both requirements -
                when a module you rely on genuinely can&apos;t satisfy both at once.
              </p>
              <p>
                A module that would rather support multiple installed majors side by side than force that choice
                can opt in with <code className="text-foreground">&quot;shareable&quot;: false</code>. Each
                dependent then gets wired to whichever version it actually declared, automatically, with no manual
                resolution needed. This only makes sense for a module with no persisted state of its own - a module
                that owns a <code className="text-foreground">backend.collection</code> should leave{" "}
                <code className="text-foreground">shareable</code> at its default, since two live copies of
                something meant to be a single shared source of truth would fork the data, not share it.
              </p>
              <p>
                For a module that does own persisted data, the shape of what&apos;s already stored is versioned
                separately from the module itself, via <code className="text-foreground">schemaVersion</code>.
                Bumping it requires publishing a normalizer (<code className="text-foreground">functions.provides</code>)
                that upgrades an older document to the current shape on read, so the module&apos;s own version can
                move forward freely without ever leaving a previously-stored document unreadable.
              </p>
            </Section>
          </div>
        </div>
      </main>
    </div>
  )
}
