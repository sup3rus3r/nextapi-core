#!/usr/bin/env node
// Interactive setup: `npm run add:mobile`
// Installs Capacitor into frontend/ and adds the chosen native platform(s)
// without touching the existing web build (next.config.ts, NextAuth, etc).
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const frontendDir = path.join(root, "frontend");

function run(cmd, args, cwd) {
  const result = spawnSync(cmd, args, { cwd, stdio: "inherit", shell: true });
  if (result.status !== 0) {
    console.error(`\nCommand failed: ${cmd} ${args.join(" ")}`);
    process.exit(result.status ?? 1);
  }
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => {
    rl.close();
    resolve(answer.trim().toLowerCase());
  }));
}

async function main() {
  console.log("NextAPI mobile setup\n");
  console.log("Which platforms do you want to add?");
  console.log("  1) Android");
  console.log("  2) iOS");
  console.log("  3) Both\n");

  const choice = await ask("Enter 1, 2, or 3: ");
  const wantAndroid = choice === "1" || choice === "3";
  const wantIOS = choice === "2" || choice === "3";

  if (!wantAndroid && !wantIOS) {
    console.error("No valid platform selected. Aborting.");
    process.exit(1);
  }

  if (wantIOS && process.platform !== "darwin") {
    console.warn("Warning: adding iOS requires Xcode, which only runs on macOS. Continuing anyway -`npx cap add ios` may fail here.");
  }

  const deps = ["@capacitor/core", "@capacitor/preferences"];
  const devDeps = ["@capacitor/cli"];
  if (wantAndroid) deps.push("@capacitor/android");
  if (wantIOS) deps.push("@capacitor/ios");

  console.log("\nInstalling Capacitor packages in frontend/ ...");
  run("npm", ["install", ...deps], frontendDir);
  run("npm", ["install", "-D", ...devDeps], frontendDir);

  console.log("\nBuilding static export for Capacitor to bundle...");
  run("npm", ["run", "build:mobile"], frontendDir);

  if (!existsSync(path.join(frontendDir, "capacitor.config.ts"))) {
    console.error("capacitor.config.ts not found in frontend/. Aborting.");
    process.exit(1);
  }

  if (wantAndroid && !existsSync(path.join(frontendDir, "android"))) {
    console.log("\nAdding Android platform...");
    run("npx", ["cap", "add", "android"], frontendDir);
  }

  if (wantIOS && !existsSync(path.join(frontendDir, "ios"))) {
    console.log("\nAdding iOS platform...");
    run("npx", ["cap", "add", "ios"], frontendDir);
  }

  console.log("\nSyncing web assets into native project(s)...");
  run("npx", ["cap", "sync"], frontendDir);

  console.log(`
Mobile setup complete.

Next steps:
  1. Set NEXT_PUBLIC_BACKEND_URL in frontend/.env.local to your FastAPI
     backend's reachable address (not localhost -use your LAN IP or a
     tunnel when testing on a device/emulator).
  2. Re-run "npm run cap:sync" (in frontend/) after any frontend change
     to rebuild the static export and sync it into the native project.
  3. Open the native project to run on a device/emulator:
       npx cap open android
       npx cap open ios
`);
}

main();
