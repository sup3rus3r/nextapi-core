import { execSync } from "node:child_process";

// Step 12 of docs §6 / §14: newly-synced module code (new backend packages,
// new main.py imports) is not loaded by an already-running uvicorn process, and
// on Windows the `npm run dev` process tree does not tear down cleanly on a
// simple stop signal, leaving orphaned processes holding ports 3000/8000. This
// step only *detects and reports* a running dev server — it deliberately does
// NOT auto-kill/restart it, since force-killing a process the CLI didn't start
// is a destructive action; the user restarts explicitly.
export function checkDevServerRunning() {
  const port8000 = isPortListening(8000);
  const port3000 = isPortListening(3000);

  if (port8000 || port3000) {
    console.warn(
      `\nWarning: a dev server appears to be running (port 8000: ${port8000 ? "in use" : "free"}, ` +
      `port 3000: ${port3000 ? "in use" : "free"}). Newly-synced backend code will NOT be loaded ` +
      `until you restart it — stop \`npm run dev\` and start it again.\n`
    );
  }
}

function isPortListening(port) {
  try {
    const output = execSync(`netstat -ano`, { encoding: "utf8" });
    const re = new RegExp(`:${port}\\s+\\S+\\s+LISTENING`);
    return re.test(output);
  } catch {
    return false;
  }
}
