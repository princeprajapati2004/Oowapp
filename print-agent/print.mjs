// Sends already-rendered ESC/POS bytes to a Windows-installed printer's RAW
// spooler queue. Shells out to RawPrint.ps1 (P/Invoke into winspool.drv)
// rather than a native Node addon — see that file for why.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.join(__dirname, "RawPrint.ps1");

/** @param {string} printerName @param {string} base64Bytes @returns {Promise<{ok: true} | {ok: false, error: string}>} */
export async function printRawBytes(printerName, base64Bytes) {
  const bytes = Buffer.from(base64Bytes, "base64");
  const tempFile = path.join(os.tmpdir(), `oowapp-print-${Date.now()}-${Math.random().toString(36).slice(2)}.bin`);
  fs.writeFileSync(tempFile, bytes);

  try {
    return await new Promise((resolve) => {
      const ps = spawn(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", SCRIPT_PATH, "-PrinterName", printerName, "-FilePath", tempFile],
        { windowsHide: true }
      );
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
  } finally {
    fs.unlink(tempFile, () => {});
  }
}
