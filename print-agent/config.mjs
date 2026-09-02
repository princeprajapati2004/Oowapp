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

const DEFAULT_SERIAL_CONFIG = { baudRate: 9600, dataBits: 8, parity: "None", stopBits: "One" };

/**
 * Per-COM-port serial settings for Bluetooth SPP printers — not hard-coded:
 * defaults are the conventional values every such virtual port accepts,
 * but can be overridden per port by hand-editing config.local.json, e.g.:
 *   { "serialPorts": { "COM5": { "baudRate": 115200 } } }
 * Read independently of loadConfig()'s pairing-validity gate, since this
 * should work even before/without a fully paired agent.
 */
export function getSerialConfig(comPort) {
  if (!fs.existsSync(CONFIG_FILE)) return DEFAULT_SERIAL_CONFIG;
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
    return { ...DEFAULT_SERIAL_CONFIG, ...(raw.serialPorts?.[comPort] ?? {}) };
  } catch {
    return DEFAULT_SERIAL_CONFIG;
  }
}
