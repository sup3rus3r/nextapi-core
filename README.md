<div align="center">

<img src="./frontend/image.png" alt="NextAPI Core landing page" width="100%" />

# NextAPI Core

A FastAPI and Next.js starter, extended by a module registry.

[Quickstart](#quickstart) · [Module Registry](#the-module-registry) · [Starter Variant](#starter-template-variant) · [Docker](#docker) · [Mobile](#mobile-capacitor) · [nextapi.app](https://www.nextapi.app)

</div>

---

## What this is

NextAPI Core is a full-stack starter: JWT authentication, role-based access control, and a dual-database backend, wired up from the start.

When the starter doesn't have a feature you need, the CLI installs one from a module registry: a page, wired to a backend route and database model, in one command. No account required to install. Generate a module with an AI Builder, or publish your own for others to install.

A module is a full-stack feature: frontend routes, backend logic, and a database model, declared in one manifest and wired into the app as a unit.

## What's included

| | |
|---|---|
| **JWT Authentication** | Credentials-based auth via NextAuth v5. Payloads are AES-256-CBC encrypted before the JWT is issued. |
| **FastAPI Backend** | An async Python API with Pydantic v2 validation and SQLAlchemy 2.0 session management. |
| **Dual Database Support** | Runs on SQLite by default. Switch to MongoDB with one environment variable. |
| **Role-Based Access Control** | Admin, user, and guest roles are embedded in the JWT and enforced on both the backend and frontend. |
| **API Client Tokens** | Machine-to-machine auth via `X-API-Key` / `X-API-Secret` headers, separate from user sessions. |
| **Docker Compose Stack** | Frontend, backend, and an optional nginx reverse proxy with SSL are defined and ready to run. |
| **Web and Mobile, One Codebase** | Bundle the same frontend into native Android and iOS apps with Capacitor, using the same JWT endpoints. |
| **A Configurable App Shell** | A sidebar or a top navbar, set once at build time. Installed modules populate its nav automatically. |
| **Two Starter Variants** | Ship with the Docs/Admin/Guest demo pages, or strip them for a blank slate built up entirely from the registry - see [Starter template variant](#starter-template-variant). |

## Quickstart

**Prerequisites:** Node.js 18+, Python 3.12+, [uv](https://docs.astral.sh/uv/getting-started/installation/), and MongoDB if you're not using SQLite.

bash/zsh:

```bash
git clone <your-repo-url>
cd nextapi-core

npm install
cd frontend && npm install && cd ..
cd backend && uv sync && cd ..
```

PowerShell (`&&` chaining isn't available in Windows PowerShell 5.1, so each command's on its own line instead):

```powershell
git clone <your-repo-url>
cd nextapi-core

npm install

cd frontend
npm install
cd ..

cd backend
uv sync
cd ..
```

Generate `backend/.env` and `frontend/.env.local` for you - real secrets, not placeholders you have to remember to fill in:

```bash
npm run setup
```

It'll ask whether you want SQLite (default - no further setup, just works) or MongoDB (asks for a connection string). `ENCRYPTION_KEY` / `JWT_SECRET_KEY` / `AUTH_SECRET` are generated for you, and the same encryption key is written to both files automatically - the two most common ways to break auth by hand (a leftover placeholder value, or the two files' keys drifting apart) can't happen this way. Re-running `npm run setup` is a safe no-op if the files already exist; delete them first if you want to regenerate.

Prefer to do it by hand, or need this for CI/Docker instead? See [Environment variables](#environment-variables) for the full list and what each one does.

Run it:

```bash
npm run dev
```

Frontend on `localhost:3000`, backend on `localhost:8000`. Register an account at `localhost:3000/register` to get started.

<div align="center">
<img src="./frontend/image1.png" alt="NextAPI Core login page" width="480" />
</div>

## Starter template variant

The starter ships with three demo pages under the app shell - Docs (`/home`), Admin Panel, and Guest Page - showing off RBAC, routing, and the nav integration modules also get. If you'd rather start from a genuinely blank project and build everything up from the module registry, strip them out once, at setup:

```bash
npm run init:blank
```

This permanently deletes `frontend/app/(app)/admin/` and `frontend/app/(app)/guest/`, replaces `frontend/app/(app)/home/page.tsx` with a minimal placeholder (it's still the default post-login landing page - just empty, with a pointer to `nextapi add`/`sync` and the AI Builder instead of demo content), and removes their entries from `frontend/config/routes.ts`. `rbac-tests/` and auth pages are left alone.

This is a one-time, run-once setup script, not a runtime toggle (unlike `NEXT_PUBLIC_APP_SHELL`) - the files are actually deleted, not hidden behind a flag, so there's nothing left to accidentally re-expose in production and no dead code to carry forward. It refuses to run twice (checks for `.nextapi/blank-applied`) and aborts with a clear error instead of guessing if `routes.ts` has already been hand-edited. Pass `--yes`/`-y` to skip the confirmation prompt.

## The module registry

The official registry is [nextapi.app](https://www.nextapi.app). Browse modules, generate one with the AI Builder, or mint a publish token at [nextapi.app/settings/tokens](https://www.nextapi.app/settings/tokens).

Install a module with no account required:

```bash
npm run nextapi -- add @sup3rus3r/team-workspace
npm run nextapi -- sync
```

`add` fetches the module from the registry. `sync` wires its routes, models, and RBAC into this codebase, and adds it to your sidebar or navbar. No manual wiring, either command.

Publishing requires an account on the target registry:

```bash
npm run nextapi -- login
npm run nextapi -- publish ./my-module
```

The CLI lives at `scripts/nextapi-cli/`, run through `npm run nextapi --`. It always installs from and publishes to the official NextAPI registry - nothing to configure.

| Command | Does |
|---|---|
| `add <id\|id@range\|path>` | Stages a module for install |
| `sync` | Installs everything staged, fetching transitive dependencies automatically |
| `remove <id> [--force] [--purge-env]` | Uninstalls a module |
| `list` | Lists installed modules and flags drift |
| `login` | Authenticates against the registry |
| `publish [dir]` | Publishes the module in `dir` as a new version |
| `validate [dir]` | Checks a `module.json` for common problems, no network call |

Full reference, including the `module.json` schema and versioning rules, is on the `/home` route once the app is running.

<div align="center">
<img src="./frontend/image2.png" alt="NextAPI Core docs page" width="100%" />
</div>

### Linking modules to your real collections

A module can declare a Mongo collection (e.g. `"users"`) that overlaps with a collection this starter already owns. Installing one used to always create a second, disconnected collection with that name - a "user management" module's own `users` had nothing to do with who could actually log into your app.

`sync` now checks this at install time: if a module's own model fields are compatible with a host collection it names, it offers to link the module to the real data instead of creating a duplicate.

```
'@alice/user-management' declares a "users" collection compatible with your
existing UserCollection. Link it instead of creating a separate collection? (y/N)
```

Say yes and the module's generated code is rewritten to call your real `UserCollection` - no second collection, no drift between "users the module knows about" and "users who can sign in." `--yes` confirms automatically for non-interactive runs. A module whose fields don't match gets installed against its own collection as before, with an exact field-by-field report of what didn't line up, so its author has something concrete to fix and republish.

The decision is remembered. Installing a new version of an already-linked module re-links it automatically - you're not asked again every time you update. If a new version's schema stops matching, it falls back to its own collection instead of staying linked to something it no longer fits, and `sync` warns you explicitly: anything the module already wrote through the link stays in your real collection, but new writes go to its own until it's re-linked.

This only recognizes collections this starter itself ships (`users`, in `scripts/nextapi-cli/lib/hostCollections.mjs`) - a module targeting anything else installs exactly as it always has.

**Method adoption.** Matching fields isn't enough on its own - a module can also call methods on its collection class (`UserCollection.count(...)`, `.list_page(...)`) that your real `UserCollection` doesn't have. When that happens, `sync` copies the module's own implementation of those specific methods into your real `models_mongo.py`, purely additive - it never touches or overwrites a method your host already has, since something else (like `/auth/register`) may already depend on it behaving exactly as it does today:

```
Linked '@alice/user-management' to your existing UserCollection.
  Adopted into UserCollection: count, list_page
  (these are now part of your host's UserCollection - inspect backend/models_mongo.py)
```

**Real-data field checks.** A field can be compatible on paper and still not match reality: your `users` collection may hold documents written before a field existed on your model, especially if the model itself was never enforced on every write path. `sync` samples your actual MongoDB collection at link time and, if a field your model declares required is missing from real, existing documents, asks explicit consent before demoting that field to optional in your host's schema:

```
'users' collection: 'created_at' is declared required, but missing from
214/1,048 existing documents. Demote 'created_at' to optional in your
host's UserMongo model to match reality? (y/N)
```

Declining aborts the entire link for that module - nothing is written, and it falls back to its own separate collection, same as an incompatible-fields case. Accepting mutates only the type annotation (`datetime` becomes `Optional[datetime]`), keeping whatever default your model already had. This check requires your backend's Mongo to be reachable from the machine running `sync` - if it isn't, `sync` skips it silently and links exactly as it would have before this check existed.

**If you're building a module that manages users** (or anything else the host already models), match the host's real field names and types up front - a module modeling `username`, `email`, `role`, and `hashed_password` against `UserMongo`'s actual shape links cleanly instead of falling through to its own disconnected collection. And once linked, don't assume every existing document has every field: read anything that came from a host-owned collection with `doc.get("field")`, not `doc["field"]`, and type it `Optional[...]` in your response schema - the host's real data can predate your module by years.

**Installing a public module that doesn't link?** Fork it - either by hand, or by handing the field-mismatch report to the AI Builder and asking it to update the module's model to match - then republish. A module that links correctly today keeps linking for everyone who installs it after you.

## Routes

| Route | Roles | What it is |
|---|---|---|
| `/` | Public | Landing page |
| `/login`, `/register` | Public | Auth |
| `/home` | admin, user, guest | Docs: what's included, the CLI, the manifest schema |
| `/rbac-tests` | admin, user, guest | Session and role test panel |
| `/admin` | admin | Admin-only demo page |
| `/guest` | guest, admin | Guest-and-admin demo page |

`/admin` and `/guest` (and `/home`'s demo content) are only present in the default starter variant - gone if you ran [`npm run init:blank`](#starter-template-variant).

Defined in `frontend/config/routes.ts`. Role checks there are frontend-only, gating which pages render and what the sidebar shows. Enforce role checks in the backend route itself for any endpoint that needs one.

## Authentication

Login and registration payloads are AES-256-CBC encrypted client-side, decrypted on the backend, then exchanged for a signed JWT with the user id, username, and role.

bash/zsh:

```bash
curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"encrypted": "<encrypted-payload>"}'

curl http://localhost:8000/health \
  -H "Authorization: Bearer <jwt>"
```

PowerShell (`curl` is aliased to `Invoke-WebRequest` there with different flags - use `curl.exe` to get the real thing, built into Windows 10+):

```powershell
curl.exe -X POST http://localhost:8000/auth/login -H "Content-Type: application/json" -d '{\"encrypted\": \"<encrypted-payload>\"}'

curl.exe http://localhost:8000/health -H "Authorization: Bearer <jwt>"
```

For machine-to-machine access, mint an API client instead of sharing a user's session:

bash/zsh:

```bash
curl -X POST http://localhost:8000/api-clients \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"name": "My App"}'

curl http://localhost:8000/health \
  -H "X-API-Key: <client_id>" \
  -H "X-API-Secret: <client_secret>"
```

PowerShell:

```powershell
curl.exe -X POST http://localhost:8000/api-clients -H "Authorization: Bearer <jwt>" -H "Content-Type: application/json" -d '{\"name\": \"My App\"}'

curl.exe http://localhost:8000/health -H "X-API-Key: <client_id>" -H "X-API-Secret: <client_secret>"
```

The secret is shown once, at creation time.

## API reference

| Method | Endpoint | Auth |
|---|---|---|
| POST | `/auth/register` | None |
| POST | `/auth/login` | None |
| GET | `/health` | JWT or API client |
| GET | `/get_user_details` | JWT or API client |
| PUT | `/user/toggle-role` | JWT |
| POST | `/api-clients` | JWT |
| GET | `/api-clients` | JWT |
| DELETE | `/api-clients/{client_id}` | JWT |

## Environment variables

`npm run setup` (see [Quickstart](#quickstart)) generates and writes the four required variables for you - this table is for reference, for Docker, or if you're setting things up by hand.

| Variable | File | Required | Default | Description |
|---|---|---|---|---|
| `ENCRYPTION_KEY` | `backend/.env` | Yes | — | AES key for auth payloads. 64 hex characters (`openssl rand -hex 32`). Must exactly match `NEXT_PUBLIC_ENCRYPTION_KEY` below - a mismatch fails auth with "Invalid encrypted data", and a real value must actually replace this, not the literal text of an example. |
| `JWT_SECRET_KEY` | `backend/.env` | Yes | — | JWT signing secret. Same format as `ENCRYPTION_KEY`, but must be a **different** value - it signs tokens, not encrypts payloads. |
| `AUTH_SECRET` | `frontend/.env.local` | Yes | — | NextAuth session secret. Base64, 32 bytes (`openssl rand -base64 32`). |
| `NEXT_PUBLIC_ENCRYPTION_KEY` | `frontend/.env.local` | Yes | — | Must be the exact same value as `ENCRYPTION_KEY`. |
| `DATABASE_TYPE` | `backend/.env` | No | `sqlite` | Only `sqlite` or `mongo` are recognized - any other value (a typo like `monogo`) is **silently treated as sqlite**, with no error, so double-check this one if MongoDB doesn't seem to be taking effect. |
| `MONGO_URI` | `backend/.env` | If mongo | — | MongoDB connection string, e.g. `mongodb://localhost:27017`. Ignored entirely when `DATABASE_TYPE=sqlite`. |
| `NEXT_PUBLIC_APP_SHELL` | `frontend/.env.local` | No | `sidebar` | `sidebar` or `navbar` |
| `NEXT_PUBLIC_BACKEND_URL` | `frontend/.env.local` | Mobile only | — | LAN-reachable backend address for Capacitor |
| `JWT_ALGORITHM` | `backend/.env` | No | `HS256` | JWT algorithm |
| `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` | `backend/.env` | No | `30` | Token lifetime |

## Docker

Docker Compose reads a single root `.env`, unlike local dev's two separate files - generate the values as shell variables first, then write them, so `NEXT_PUBLIC_ENCRYPTION_KEY` is guaranteed to actually match `ENCRYPTION_KEY` instead of needing to be copied over by hand.

bash/zsh:

```bash
ENC_KEY=$(openssl rand -hex 32)

cat > .env <<EOF
ENCRYPTION_KEY=$ENC_KEY
JWT_SECRET_KEY=$(openssl rand -hex 32)
AUTH_SECRET=$(openssl rand -base64 32)
NEXT_PUBLIC_ENCRYPTION_KEY=$ENC_KEY
EOF

docker compose up --build
```

PowerShell (no `openssl` needed - uses .NET's crypto RNG directly):

```powershell
function New-HexKey { $b = [byte[]]::new(32); [Security.Cryptography.RandomNumberGenerator]::Fill($b); ($b | ForEach-Object { $_.ToString("x2") }) -join "" }
function New-Base64Secret { $b = [byte[]]::new(32); [Security.Cryptography.RandomNumberGenerator]::Fill($b); [Convert]::ToBase64String($b) }

$encKey = New-HexKey

@"
ENCRYPTION_KEY=$encKey
JWT_SECRET_KEY=$(New-HexKey)
AUTH_SECRET=$(New-Base64Secret)
NEXT_PUBLIC_ENCRYPTION_KEY=$encKey
"@ | Set-Content -Encoding utf8 .env

docker compose up --build
```

Frontend on `localhost:3000`, backend on `localhost:8000`. SQLite persists in a named volume (`backend_data`).

MongoDB:

```bash
DATABASE_TYPE=mongo MONGO_URI=mongodb://user:pass@host:27017/dbname docker compose up --build
```

```powershell
$env:DATABASE_TYPE = "mongo"
$env:MONGO_URI = "mongodb://user:pass@host:27017/dbname"
docker compose up --build
```

SSL via nginx is optional, behind the `ssl` compose profile:

```bash
openssl req -x509 -newkey rsa:4096 -keyout nginx/certs/key.pem \
  -out nginx/certs/cert.pem -days 365 -nodes -subj "/CN=localhost"

docker compose --profile ssl up --build
```

```powershell
openssl req -x509 -newkey rsa:4096 -keyout nginx/certs/key.pem -out nginx/certs/cert.pem -days 365 -nodes -subj "/CN=localhost"

docker compose --profile ssl up --build
```

(This one still needs `openssl` itself, on either shell - it's generating a certificate, not a random value .NET can do standalone. On Windows, install it via `winget install ShiningLight.OpenSSL` or through Git for Windows' bundled copy.)

## Mobile (Capacitor)

The same `frontend/` codebase ships as a native Android or iOS app. Web keeps NextAuth unchanged; mobile authenticates directly against FastAPI's JWT endpoints and stores the token via `@capacitor/preferences`.

```bash
npm run add:mobile
```

Prompts for a platform, installs the Capacitor packages, builds a static export, and runs `cap add` and `cap sync`. Set `NEXT_PUBLIC_BACKEND_URL` to a LAN-reachable address, not `localhost`, before testing on a device.

```bash
cd frontend
npm run build:mobile
npm run cap:sync
npx cap open android
npx cap open ios
```

## Tech stack

**Frontend** — Next.js 16, React 19, TypeScript, Tailwind CSS 4, NextAuth 5

**Backend** — FastAPI, SQLAlchemy 2.0, Motor, Pydantic v2, python-jose, bcrypt

## License

MIT
