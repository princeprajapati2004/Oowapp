// `node print-agent/index.mjs diagnose` — a read-only health check for
// exactly the failure modes that are otherwise invisible from the web app:
// is the Windows spooler running, what does Windows actually see as
// printers/Bluetooth devices/COM ports, is a paired Bluetooth SPP device's
// radio link actually live right now, and (if paired) can this agent reach
// the backend and open its job stream. Never fabricates a result — every
// line here comes from an actual Windows/network call made just now.
//
// Important: Windows' own "Connected" indicator for a paired Bluetooth
// printer (DEVPKEY_DeviceContainer_AlwaysShowDeviceAsConnected) is often
// hard-wired true regardless of whether the radio link is actually live —
// confirmed directly against a real device while building this. So this
// report always performs its own port-open probe rather than trusting that
// flag, and labels the two separately.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.mjs";
import { createApiClient, ApiError } from "./api.mjs";
import { discoverPrinters, discoverBluetoothSppDevices } from "./printers.mjs";
import { testSerialPortReachable } from "./print.mjs";

function runPowerShell(args) {
  return new Promise((resolve, reject) => {
    const ps = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", ...args], { windowsHide: true });
    let stdout = "";
    let stderr = "";
    ps.stdout.on("data", (d) => (stdout += d));
    ps.stderr.on("data", (d) => (stderr += d));
    ps.on("error", reject);
    ps.on("close", (code) => (code === 0 ? resolve(stdout) : reject(new Error(stderr.trim() || `exit ${code}`))));
  });
}

async function getSpoolerStatus() {
  try {
    const out = await runPowerShell(["-Command", "(Get-Service -Name Spooler).Status"]);
    return out.trim() || "UNKNOWN";
  } catch (err) {
    return `UNKNOWN (${err.message})`;
  }
}

async function getBluetoothServiceStatus() {
  try {
    const out = await runPowerShell(["-Command", "(Get-Service -Name bthserv).Status"]);
    return out.trim() || "UNKNOWN";
  } catch (err) {
    return `UNKNOWN (${err.message})`;
  }
}

function pad(label, width = 28) {
  return label + " " + ".".repeat(Math.max(1, width - label.length)) + " ";
}

export async function runDiagnostics() {
  console.log("=====================================");
  console.log("PRINT AGENT DIAGNOSTICS");
  console.log("=====================================");
  console.log("");

  const config = loadConfig();
  if (!config) {
    console.log("Agent: NOT PAIRED — run without 'diagnose' to pair this agent first.");
  } else {
    console.log(`Agent: configured (id ${config.agentId}, computer "${config.computerName}")`);
    console.log(`Backend: ${config.backendUrl}`);
    const api = createApiClient(config.backendUrl, config.token);

    try {
      const hb = await api.heartbeat();
      console.log(`Backend: CONNECTED (heartbeat accepted, status: ${hb.status})`);
    } catch (err) {
      const detail = err instanceof ApiError ? `HTTP ${err.status} — ${err.message}` : err.message;
      console.log(`Backend: UNREACHABLE — ${detail}`);
    }

    try {
      const res = await api.openJobStream();
      console.log(res.ok ? "SSE: CONNECTED" : `SSE: FAILED — HTTP ${res.status}`);
      res.body?.cancel?.();
    } catch (err) {
      console.log(`SSE: FAILED — ${err.message}`);
    }
  }

  console.log(`Windows Print Spooler: ${await getSpoolerStatus()}`);
  console.log(`Windows Bluetooth Support Service: ${await getBluetoothServiceStatus()}`);

  console.log("");
  console.log("Bluetooth devices:");
  const sppDevices = await discoverBluetoothSppDevices();
  if (sppDevices.length === 0) {
    console.log("  (no paired Bluetooth device with an available SPP COM port and no printer queue)");
  }
  for (const device of sppDevices) {
    const probe = await testSerialPortReachable(device.comPort);
    console.log("");
    console.log(`  ${device.deviceName}`);
    console.log(`    Address: ${device.address}`);
    console.log(`    Paired: YES`);
    console.log(
      `    OS "Connected" flag: (unreliable for Bluetooth printers — Windows often always shows this true; ignored here)`
    );
    console.log(`    Last actually connected: ${device.lastConnectedTime ?? "unknown"}`);
    console.log(`    SPP: YES (Windows created a virtual COM port)`);
    console.log(`    Port: ${device.comPort}`);
    console.log(`    Port Open: ${probe.ok ? "YES" : "NO"}`);
    console.log(`    SPP Reachable: ${probe.ok ? "YES" : "NO"}`);
    if (!probe.ok) console.log(`    Error: ${probe.error}`);
  }

  console.log("");
  console.log("Printers:");
  const printers = await discoverPrinters();
  if (printers.length === 0) console.log("  (none found)");
  for (const p of printers) {
    const display = p.label ? `${p.label} [${p.systemPrinterName}]` : p.systemPrinterName;
    const status = p.reachable === false ? "OFFLINE (paired but not reachable)" : "ONLINE";
    console.log(`  ${pad(display)} ${p.connectionType.padEnd(10)} ${status}`);
  }

  console.log("");
  console.log("Raw printing availability:");
  console.log("  Windows printer queues -> RAW datatype via winspool.drv (RawPrint.ps1)");
  console.log("  Bluetooth SPP COM ports -> direct serial write (SerialPrint.ps1), only when SPP Reachable = YES above");
  console.log("=====================================");
}
