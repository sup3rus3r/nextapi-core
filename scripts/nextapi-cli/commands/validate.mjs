import { validateModule } from "../lib/validate.mjs";

// docs §7: the 4 static checks a module author can run locally before ever
// talking to the registry. publish.mjs also calls validateModule directly
// (not this file) so publish can fail fast without a second process to spawn.
export async function validate(moduleDir = process.cwd()) {
  const { ok, errors } = validateModule(moduleDir);

  if (ok) {
    console.log(`✓ ${moduleDir} passed all checks.`);
    return;
  }

  console.log(`✗ ${errors.length} problem${errors.length === 1 ? "" : "s"} found in ${moduleDir}:\n`);
  for (const error of errors) {
    console.log(`  ✗ ${error}`);
  }
  process.exitCode = 1;
}
