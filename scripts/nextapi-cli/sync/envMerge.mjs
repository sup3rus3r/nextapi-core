import fs from "node:fs";

function parseEnvKeys(content) {
  const keys = new Set();
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (match) keys.add(match[1]);
  }
  return keys;
}

// Step 7 of docs §6 (.env / .env.local). Appends missing keys under a
// `# --- module: <id> ---` header; never touches a key that already exists with
// a non-empty value (docs convention). Placeholder values use the manifest's
// `default`, or a generic "your-<key>-here" placeholder mirroring the existing
// backend/.env.example style, when the value is a secret with no default.
export function mergeEnvFile(envPath, moduleId, envSpecs) {
  if (!envSpecs || envSpecs.length === 0) return;

  const usesCrlf = fs.existsSync(envPath) && fs.readFileSync(envPath, "utf8").includes("\r\n");
  let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  const existingKeys = parseEnvKeys(content);

  const missing = envSpecs.filter((spec) => !existingKeys.has(spec.key));
  if (missing.length === 0) return;

  const headerMarker = `# --- module: ${moduleId} ---`;
  if (content.includes(headerMarker)) return; // header already present; assume already merged once

  const lines = [headerMarker];
  for (const spec of missing) {
    const value = spec.default ?? `your-${spec.key.toLowerCase().replace(/_/g, "-")}-here`;
    lines.push(`${spec.key.padEnd(32)} =${value}`);
  }

  const separator = content.endsWith("\n") || content === "" ? "" : usesCrlf ? "\r\n" : "\n";
  const newLines = lines.join(usesCrlf ? "\r\n" : "\n");
  content = content + separator + newLines + (usesCrlf ? "\r\n" : "\n");

  fs.writeFileSync(envPath, content, "utf8");
}
