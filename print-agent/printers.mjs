// Dynamic Windows printer discovery — no hard-coded printer names/brands.
// Shells out to PowerShell's Get-Printer (present on every Windows install,
// no extra dependency) rather than a native Node addon, so this script runs
// on a bare `node print-agent/index.js` with nothing to compile.
import { spawn } from "node:child_process";

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

/** Returns every printer Windows currently knows about, each as `{ systemPrinterName, connectionType }` — exactly the shape POST /api/agent/printers expects. */
export async function discoverPrinters() {
  const stdout = await runPowerShell([
    "-Command",
    "Get-Printer | Select-Object Name, PortName | ConvertTo-Json -Compress",
  ]);
  const trimmed = stdout.trim();
  if (!trimmed) return [];

  const parsed = JSON.parse(trimmed);
  const list = Array.isArray(parsed) ? parsed : [parsed];
  return list
    .filter((p) => p && typeof p.Name === "string" && p.Name.length > 0)
    .map((p) => ({
      systemPrinterName: p.Name,
      connectionType: inferConnectionType(p.PortName),
    }));
}
