// Local agent identity/config — mirrors bridge/server.mjs's token.local.txt
// pattern: a small file next to this script, gitignored, holding whatever
// this specific machine needs to authenticate as itself. Never committed,
// never sent anywhere except back to the backend that issued it.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const CONFIG_FILE = path.join(__dirname, "config.local.json");

export function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) return null;
  try {
    const raw = fs.readFileSync(CONFIG_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed.agentId || !parsed.token || !parsed.backendUrl) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveConfig(config) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
}
