import readline from "node:readline";
import { writeJson, readJson } from "../lib/fsutil.mjs";
import { AUTH_PATH } from "../lib/paths.mjs";

function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// Publishing authenticates with an API token (client_id + client_secret),
// the same credential type npm/PyPI use for CLI publishing — not a
// username/password session. Generate one at /settings/tokens while logged
// into the website, then paste it here once.
export async function login() {
  console.log("Create a token at /settings/tokens (while logged into the website), then paste it here.");
  const pasted = await ask("Token (client_id:client_secret): ");

  const separatorIndex = pasted.indexOf(":");
  if (separatorIndex === -1) {
    throw new Error("Expected a token in the form client_id:client_secret.");
  }
  const clientId = pasted.slice(0, separatorIndex).trim();
  const clientSecret = pasted.slice(separatorIndex + 1).trim();
  if (!clientId || !clientSecret) {
    throw new Error("Expected a token in the form client_id:client_secret.");
  }

  writeJson(AUTH_PATH, {
    clientId,
    clientSecret,
    savedAt: new Date().toISOString(),
  });

  console.log("Token saved to .nextapi/auth.json.");
}

export function loadAuth() {
  const auth = readJson(AUTH_PATH, null);
  if (!auth) {
    throw new Error("Not logged in. Run `nextapi login` first.");
  }
  return auth;
}
