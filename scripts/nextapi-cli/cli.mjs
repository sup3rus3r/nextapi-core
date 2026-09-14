#!/usr/bin/env node
import { addModule } from "./commands/add.mjs";
import { sync } from "./commands/sync.mjs";
import { removeModule } from "./commands/remove.mjs";
import { listModules } from "./commands/list.mjs";
import { login } from "./commands/login.mjs";
import { publish } from "./commands/publish.mjs";
import { validate } from "./commands/validate.mjs";

const [command, ...args] = process.argv.slice(2);

function usage() {
  console.log("Usage: nextapi <add|sync|remove|list|login|publish|validate> [args]");
  console.log("  nextapi add <id|id@range|path>     Stage a module for install (pending).");
  console.log("                                      A bare id or id@range not satisfied locally");
  console.log("                                      is fetched from the registry automatically.");
  console.log("  nextapi sync [--yes|-y]             Install/update all staged modules");
  console.log("                                      (also auto-fetches missing dependencies;");
  console.log("                                      --yes overwrites any drifted platform ui");
  console.log("                                      components and confirms linking a module's");
  console.log("                                      collection to a matching host collection,");
  console.log("                                      all without prompting)");
  console.log("  nextapi remove <module-id> [--force] [--purge-env]");
  console.log("                                      Uninstall a module");
  console.log("  nextapi list                        List installed modules and drift status");
  console.log("  nextapi login                       Authenticate against the registry");
  console.log("  nextapi publish [dir]               Publish the module.json in dir (default: cwd)");
  console.log("  nextapi validate [dir]              Check a module.json for common problems");
}

async function main() {
  switch (command) {
    case "add":
      if (args.length === 0) throw new Error("Usage: nextapi add <id|id@range|path>");
      await addModule(args[0]);
      break;
    case "sync":
      await sync({ yes: args.includes("--yes") || args.includes("-y") });
      break;
    case "remove": {
      if (args.length === 0) throw new Error("Usage: nextapi remove <module-id> [--force] [--purge-env]");
      const flags = args.slice(1);
      removeModule(args[0], {
        force: flags.includes("--force"),
        purgeEnv: flags.includes("--purge-env"),
      });
      break;
    }
    case "list":
      listModules();
      break;
    case "login":
      await login();
      break;
    case "publish":
      await publish(args[0] ? args[0] : undefined);
      break;
    case "validate":
      await validate(args[0] ? args[0] : undefined);
      break;
    default:
      usage();
      process.exit(command ? 1 : 0);
  }
}

main().catch((err) => {
  console.error(`\nError: ${err.message}`);
  process.exit(1);
});
