// Dynamic Windows printer discovery — no hard-coded printer names/brands.
// Shells out to PowerShell (present on every Windows install, no extra
// dependency) rather than a native Node addon, so this script runs on a
// bare `node print-agent/index.mjs` with nothing to compile.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { testSerialPortReachable } from "./print.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DISCOVER_BT_SPP_SCRIPT = path.join(__dirname, "DiscoverBluetoothSpp.ps1");

function runPowerShell(args) {
  return new Promise((resolve, reject) => {
    const ps = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", ...args], { windowsHide: true });
    let stdout = "";
    let stderr = "";
    ps.stdout.on("data", (d) => (stdout += d));
    ps.stderr.on("data", (d) => (stderr += d));
    ps.on("error", reject);
    ps.on("close", (code) => {
      if (code !== 0) reject(new Error(stderr.trim() || `powershell exited with code ${code}`));
      else resolve(stdout);
    });
  });
}

function parseJsonArray(stdout) {
  const trimmed = stdout.trim();
  if (!trimmed) return [];
  const parsed = JSON.parse(trimmed);
  return Array.isArray(parsed) ? parsed : [parsed];
}

/** Best-effort guess at physical connection type from the OS port name — informational only, never blocks discovery. */
export function inferConnectionType(portName) {
  const port = (portName || "").toUpperCase();
  if (port.includes("BTH") || port.includes("BLUETOOTH")) return "BLUETOOTH";
  if (port.startsWith("IP_") || port.startsWith("WSD-") || /^\d{1,3}(\.\d{1,3}){3}$/.test(port)) return "WIFI";
  // LPT/COM ports are how many cheap USB thermal printers (POS-58/POS-80
  // style drivers) actually enumerate on Windows even though the physical
  // link is USB — grouping them with USB, not treating them as a fourth type.
  if (port.startsWith("USB") || port.startsWith("LPT") || port.startsWith("COM")) return "USB";
  return "SYSTEM";
}

/** Every printer with a real Windows print queue, `{ systemPrinterName, connectionType }`. */
async function discoverWindowsPrinterQueues() {
  const stdout = await runPowerShell(["-Command", "Get-Printer | Select-Object Name, PortName | ConvertTo-Json -Compress"]);
  return parseJsonArray(stdout)
    .filter((p) => p && typeof p.Name === "string" && p.Name.length > 0)
    .map((p) => ({ systemPrinterName: p.Name, connectionType: inferConnectionType(p.PortName), label: null }));
}

/**
 * Raw candidates from DiscoverBluetoothSpp.ps1: paired Bluetooth devices
 * with an SPP COM port that has no Windows printer queue bound to it yet —
 * the state a Bluetooth thermal printer is in right after pairing, before
 * anyone runs Windows' "Add a printer" wizard against it. Includes full
 * device metadata (name/address/last-connected) for diagnostics; callers
 * that report to the backend should strip this down (see
 * discoverBluetoothSppPorts) since MAC addresses have no reason to leave
 * this machine.
 */
async function runBluetoothSppDiscoveryScript() {
  try {
    const stdout = await runPowerShell(["-ExecutionPolicy", "Bypass", "-File", DISCOVER_BT_SPP_SCRIPT]);
    return parseJsonArray(stdout).filter((p) => p && typeof p.comPort === "string");
  } catch {
    return []; // never let this optional path fail discovery of real Windows printers
  }
}

/** Diagnostics view: full metadata per paired Bluetooth SPP device, each actually probed for live reachability. See diagnose.mjs. */
export async function discoverBluetoothSppDevices() {
  const candidates = await runBluetoothSppDiscoveryScript();
  return candidates.map((p) => ({
    comPort: p.comPort.toUpperCase(),
    deviceName: p.deviceName ?? p.label,
    address: p.address ?? null,
    lastConnectedTime: p.lastConnectedTime ?? null,
  }));
}

/**
 * Windows shows a paired Bluetooth printer as "Connected" in Settings
 * regardless of whether the radio link is actually live right now (observed
 * directly: DEVPKEY_DeviceContainer_AlwaysShowDeviceAsConnected=True on this
 * class of device) — so "paired" is not "reachable." Each candidate is
 * therefore actually probed (open + immediately close, no data sent) here,
 * and `reachable` reflects that real result, not just PnP presence.
 * Reported keyed by the bare COM port name itself, which print.mjs
 * recognizes and routes to a direct serial write instead of the spooler.
 */
async function discoverBluetoothSppPorts() {
  const candidates = await runBluetoothSppDiscoveryScript();

  return Promise.all(
    candidates.map(async (p) => {
      const comPort = p.comPort.toUpperCase();
      const probe = await testSerialPortReachable(comPort);
      return {
        systemPrinterName: comPort,
        connectionType: "BLUETOOTH",
        label: p.label ?? null,
        reachable: probe.ok,
      };
    })
  );
}

/** Returns every printable target this PC currently exposes, each as `{ systemPrinterName, connectionType, label, reachable? }` — exactly the shape POST /api/agent/printers expects. */
export async function discoverPrinters() {
  const [queues, sppPorts] = await Promise.all([discoverWindowsPrinterQueues(), discoverBluetoothSppPorts()]);
  return [...queues, ...sppPorts];
}
