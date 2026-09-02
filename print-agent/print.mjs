// Sends already-rendered ESC/POS bytes to a printer target — either a
// Windows-installed printer queue (RawPrint.ps1, winspool.drv RAW job) or,
// when the target is a bare COM port, a Bluetooth Classic/SPP device that's
// paired but has no Windows printer queue bound to it (SerialPrint.ps1,
// System.IO.Ports.SerialPort). See printers.mjs for how each kind gets
// discovered and reported.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getSerialConfig } from "./config.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAW_SCRIPT_PATH = path.join(__dirname, "RawPrint.ps1");
const SERIAL_SCRIPT_PATH = path.join(__dirname, "SerialPrint.ps1");

export const COM_PORT_PATTERN = /^COM\d+$/i;

function runPowerShellScript(scriptPath, args) {
  return new Promise((resolve) => {
    const ps = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", scriptPath, ...args], {
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    ps.stdout.on("data", (d) => (stdout += d));
    ps.stderr.on("data", (d) => (stderr += d));
    ps.on("error", (err) => resolve({ ok: false, error: err.message }));
    ps.on("close", () => {
      const output = stdout.trim();
      if (output === "OK") {
        resolve({ ok: true });
      } else {
        resolve({ ok: false, error: output || stderr.trim() || "Unknown printing error" });
      }
    });
  });
}

function serialArgs(comPort) {
  const cfg = getSerialConfig(comPort.toUpperCase());
  return [
    "-ComPort",
    comPort.toUpperCase(),
    "-BaudRate",
    String(cfg.baudRate),
    "-DataBits",
    String(cfg.dataBits),
    "-Parity",
    cfg.parity,
    "-StopBits",
    cfg.stopBits,
  ];
}

/**
 * Opens (and immediately closes) a Bluetooth SPP COM port without sending
 * any data — the "is this link actually alive right now" check used by
 * both discovery (so a paired-but-unreachable device isn't falsely
 * reported CONNECTED) and `diagnose`/the SPP link test.
 * @param {string} comPort
 * @returns {Promise<{ok: true} | {ok: false, error: string}>}
 */
export function testSerialPortReachable(comPort) {
  return runPowerShellScript(SERIAL_SCRIPT_PATH, [...serialArgs(comPort), "-TestOnly"]);
}

/**
 * @param {string} target Windows printer name, or a bare COM port (e.g. "COM5") for a queue-less Bluetooth SPP device
 * @param {string} base64Bytes
 * @returns {Promise<{ok: true} | {ok: false, error: string}>}
 */
export async function printRawBytes(target, base64Bytes) {
  const bytes = Buffer.from(base64Bytes, "base64");
  const tempFile = path.join(os.tmpdir(), `oowapp-print-${Date.now()}-${Math.random().toString(36).slice(2)}.bin`);
  fs.writeFileSync(tempFile, bytes);

  try {
    if (COM_PORT_PATTERN.test(target)) {
      return await runPowerShellScript(SERIAL_SCRIPT_PATH, [...serialArgs(target), "-FilePath", tempFile]);
    }
    return await runPowerShellScript(RAW_SCRIPT_PATH, ["-PrinterName", target, "-FilePath", tempFile]);
  } finally {
    fs.unlink(tempFile, () => {});
  }
}
