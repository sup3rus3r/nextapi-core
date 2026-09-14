#!/usr/bin/env node
// One-time setup script for the "blank slate" template variant: removes the
// starter's demo Admin/Guest pages entirely and replaces the Docs page with
// a minimal placeholder, so a project can be built up purely from the module
// registry instead of carrying example content nobody asked for.
//
// This is deliberately a run-once script, not a runtime env toggle (like
// NEXT_PUBLIC_APP_SHELL) - toggles only hide these routes from nav while the
// files (and the access-control hole of an unlisted-but-still-reachable
// route - see config/routes.ts's canAccessPath default-allow) stay in the
// project either way. Real deletion is the only way to get an actually
// blank result. Run with --yes/-y to skip the confirmation prompt.
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.dirname(ROOT);
const APP_DIR = path.join(PROJECT_ROOT, "frontend", "app", "(app)");
const ROUTES_TS_PATH = path.join(PROJECT_ROOT, "frontend", "config", "routes.ts");
const BLANK_HOME_SOURCE = path.join(ROOT, "assets", "blank-home-page.tsx");
const MARKER_PATH = path.join(PROJECT_ROOT, ".nextapi", "blank-applied");

function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

async function main() {
  const yes = process.argv.includes("--yes") || process.argv.includes("-y");

  if (fs.existsSync(MARKER_PATH)) {
    console.log("Blank template already applied (found .nextapi/blank-applied) - nothing to do.");
    return;
  }

  console.log("This will permanently:");
  console.log("  - delete frontend/app/(app)/admin/ and frontend/app/(app)/guest/");
  console.log("  - replace frontend/app/(app)/home/page.tsx with a blank placeholder");
  console.log("  - remove the Admin Panel and Guest Page entries from frontend/config/routes.ts");
  console.log("rbac-tests/ and login/register are left untouched.\n");

  if (!yes) {
    const answer = await ask("Continue? This cannot be undone without re-pulling the starter. (y/N) ");
    if (answer !== "y" && answer !== "yes") {
      console.log("Aborted.");
      return;
    }
  }

  const adminDir = path.join(APP_DIR, "admin");
  const guestDir = path.join(APP_DIR, "guest");
  const homePage = path.join(APP_DIR, "home", "page.tsx");

  if (fs.existsSync(adminDir)) fs.rmSync(adminDir, { recursive: true, force: true });
  if (fs.existsSync(guestDir)) fs.rmSync(guestDir, { recursive: true, force: true });
  console.log("Deleted admin/ and guest/.");

  fs.copyFileSync(BLANK_HOME_SOURCE, homePage);
  console.log("Replaced home/page.tsx with the blank placeholder.");

  stripRoutesTs();
  console.log("Removed ADMIN_PANEL and GUEST_PAGE from routes.ts.");

  fs.mkdirSync(path.dirname(MARKER_PATH), { recursive: true });
  fs.writeFileSync(MARKER_PATH, new Date().toISOString() + "\n", "utf8");

  console.log("\nDone. Restart your dev server to see the change.");
}

// Literal string replacement against routes.ts's known, exact starter
// content, not regex surgery - a small controlled file with content we know
// verbatim doesn't need pattern matching, and literal matches fail loudly
// (via the throw below) instead of silently mismatching on some formatting
// variance a regex might tolerate wrong.
function stripRoutesTs() {
  const raw = fs.readFileSync(ROUTES_TS_PATH, "utf8");
  // routes.ts is CRLF (this is a Windows-authored starter) - normalize to LF
  // for matching against the LF literals below, then restore CRLF on write
  // so the file's line-ending convention doesn't silently change underneath
  // whatever editor/git config expects it.
  const usesCRLF = raw.includes("\r\n");
  let content = raw.replace(/\r\n/g, "\n");

  const replacements = [
    ["  ADMIN_PANEL : '/admin',\n", ""],
    ["  GUEST_PAGE  : '/guest'\n", ""],
    [
      `  {
    path: Routes.ADMIN_PANEL,
    label: 'Admin Panel',
    allowedRoles: ['admin'],
    description: 'Admin only - manage users and settings',
  },
`,
      "",
    ],
    [
      `  {
    path: Routes.GUEST_PAGE,
    label: 'Guest Page',
    allowedRoles: ['guest', 'admin'],
    description: 'Accessible to guests and admins',
  }
`,
      "",
    ],
  ];

  for (const [search, replace] of replacements) {
    if (!content.includes(search)) {
      throw new Error(
        `routes.ts doesn't match the expected starter content (looking for: ${JSON.stringify(search.slice(0, 40))}...). ` +
        `It may already be hand-edited - stopping rather than guessing at a partial edit.`
      );
    }
    content = content.replace(search, replace);
  }

  if (usesCRLF) content = content.replace(/\n/g, "\r\n");
  fs.writeFileSync(ROUTES_TS_PATH, content, "utf8");
}

main().catch((err) => {
  console.error(`\nError: ${err.message}`);
  process.exit(1);
});
