#!/usr/bin/env node
// Generates backend/.env and frontend/.env.local with real, freshly-generated
// secrets - never placeholder text a user has to remember to replace. Every
// env-setup mistake that's actually been hit in practice comes from manual
// substitution: pasting the literal "<hex key>" placeholder instead of a
// real value, letting ENCRYPTION_KEY and NEXT_PUBLIC_ENCRYPTION_KEY drift out
// of sync across two separate files, or typo-ing DATABASE_TYPE (e.g.
// "monogo") - config.py falls back to sqlite silently on any value it
// doesn't recognize, so a typo like that produces no error, just a
// confusingly wrong database. Generating the values here and writing both
// files directly removes all three failure modes at once. Uses Node's
// built-in crypto instead of shelling out to `openssl`, so there's no
// external dependency to install first either.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.dirname(ROOT);
const BACKEND_ENV_PATH = path.join(PROJECT_ROOT, "backend", ".env");
const FRONTEND_ENV_PATH = path.join(PROJECT_ROOT, "frontend", ".env.local");

// A single shared readline interface for the whole run, not one per
// question - creating a fresh interface per call breaks on piped/non-TTY
// stdin (the common case for `printf "...\n" | node setup-env.mjs`, and for
// this script's own tests): closing the first interface tears down stdin's
// listeners, so a second interface never receives its answer.
function ask(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

function hexKey() {
  return crypto.randomBytes(32).toString("hex");
}

function base64Secret() {
  return crypto.randomBytes(32).toString("base64");
}

async function main() {
  const yes = process.argv.includes("--yes") || process.argv.includes("-y");

  const backendExists = fs.existsSync(BACKEND_ENV_PATH);
  const frontendExists = fs.existsSync(FRONTEND_ENV_PATH);
  if (backendExists || frontendExists) {
    console.log("Already set up:");
    if (backendExists) console.log(`  - ${path.relative(PROJECT_ROOT, BACKEND_ENV_PATH)} exists`);
    if (frontendExists) console.log(`  - ${path.relative(PROJECT_ROOT, FRONTEND_ENV_PATH)} exists`);
    console.log("Not overwriting - delete the file(s) above first if you want freshly generated secrets.");
    return;
  }

  let databaseType = "sqlite";
  let mongoUri = "";
  if (!yes) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await ask(rl, "Database - (1) sqlite [default], (2) mongo: ");
    if (answer === "2" || answer.toLowerCase() === "mongo") {
      databaseType = "mongo";
      const uri = await ask(rl, "MongoDB connection string [mongodb://localhost:27017]: ");
      mongoUri = uri || "mongodb://localhost:27017";
    }
    rl.close();
  }

  const encryptionKey = hexKey();
  const jwtSecretKey = hexKey();
  const authSecret = base64Secret();

  const backendLines = [
    `ENCRYPTION_KEY=${encryptionKey}`,
    `JWT_SECRET_KEY=${jwtSecretKey}`,
    "",
    `DATABASE_TYPE=${databaseType}`,
  ];
  if (databaseType === "mongo") backendLines.push(`MONGO_URI=${mongoUri}`);

  fs.mkdirSync(path.dirname(BACKEND_ENV_PATH), { recursive: true });
  fs.writeFileSync(BACKEND_ENV_PATH, backendLines.join("\n") + "\n", "utf8");

  // ENCRYPTION_KEY (no NEXT_PUBLIC_ prefix) is what the frontend's own
  // server-side code (app/api/backend/auth/register, lib/crypto-server.ts)
  // actually encrypts with - it has to match the backend's ENCRYPTION_KEY
  // exactly, so it's the same generated value, just also present here since
  // Next's server-side code only ever reads from frontend/.env.local, never
  // backend/.env. NEXT_PUBLIC_ENCRYPTION_KEY is a separate, deliberately
  // public var for the mobile (Capacitor) build only, which has no server to
  // proxy through and must encrypt client-side - see lib/crypto.ts.
  const frontendLines = [
    `AUTH_SECRET=${authSecret}`,
    `ENCRYPTION_KEY=${encryptionKey}`,
    `NEXT_PUBLIC_ENCRYPTION_KEY=${encryptionKey}`,
  ];
  fs.mkdirSync(path.dirname(FRONTEND_ENV_PATH), { recursive: true });
  fs.writeFileSync(FRONTEND_ENV_PATH, frontendLines.join("\n") + "\n", "utf8");

  console.log(`Created ${path.relative(PROJECT_ROOT, BACKEND_ENV_PATH)} and ${path.relative(PROJECT_ROOT, FRONTEND_ENV_PATH)} with freshly generated secrets.`);
  console.log(`Database: ${databaseType}${databaseType === "mongo" ? ` (${mongoUri})` : " (file-backed, no setup needed)"}`);
  console.log("\nRun `npm run dev` to start.");
}

main().catch((err) => {
  console.error(`\nError: ${err.message}`);
  process.exit(1);
});
