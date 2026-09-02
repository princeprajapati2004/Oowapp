#!/usr/bin/env node
// OOWAPP Local Print Agent
//
// Runs on the owner's Windows PC and bridges OOWAPP (mobile or desktop) to
// whatever printers Windows already knows about — USB, Classic Bluetooth
// (paired at the OS level, so it shows up as a normal Windows printer), or
// network/Wi-Fi — without the browser ever touching Bluetooth/USB/raw
// sockets directly. See AGENTS.md / the printing redesign spec for why:
// browsers can't reach Classic Bluetooth SPP printers at all, which is the
// root problem this replaces.
//
// Run it with:  node print-agent/index.mjs   (or  npm run print-agent)
//
// First run: generate a pairing code from OOWAPP → Settings → Printer
// Settings → Add Printer → Local Print Agent, then either pass it with
// --pair=CODE or answer the interactive prompt.

import os from "node:os";
import readline from "node:readline";
import { loadConfig, saveConfig } from "./config.mjs";
import { createApiClient, ApiError } from "./api.mjs";
import { discoverPrinters } from "./printers.mjs";
import { printRawBytes } from "./print.mjs";
import { consumeSseStream } from "./sse.mjs";
import { runDiagnostics } from "./diagnose.mjs";

const VERSION = "1.0.0";
const HEARTBEAT_INTERVAL_MS = 20_000;
const DISCOVERY_INTERVAL_MS = 30_000;
const POLL_INTERVAL_MS = 20_000;
const STREAM_RECONNECT_MIN_MS = 1_000;
const STREAM_RECONNECT_MAX_MS = 30_000;

function parseArgs(argv) {
  const args = {};
  for (const arg of argv) {
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (match) args[match[1]] = match[2];
  }
  return args;
}

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); }));
}

async function ensureConfig() {
  const existing = loadConfig();
  if (existing) return existing;

  const args = parseArgs(process.argv.slice(2));
  const backendUrl = args.backend || process.env.OOWAPP_BACKEND_URL;
  if (!backendUrl) {
    console.error("No backend URL configured. Re-run with --backend=https://your-oowapp-domain and --pair=CODE,");
    console.error("or set OOWAPP_BACKEND_URL / OOWAPP_PAIRING_CODE environment variables.");
    process.exit(1);
  }

  let pairingCode = args.pair || process.env.OOWAPP_PAIRING_CODE;
  if (!pairingCode) {
    console.log("OOWAPP Local Print Agent — first-time setup");
    console.log("Generate a pairing code from OOWAPP: Settings -> Printer Settings -> Add Printer -> Local Print Agent.");
    pairingCode = await prompt("Enter pairing code: ");
  }
  if (!pairingCode) {
    console.error("A pairing code is required to register this agent.");
    process.exit(1);
  }

  const computerName = os.hostname();
  const api = createApiClient(backendUrl, null);
  const result = await api.register({ pairingCode, computerName, version: VERSION });

  const config = { backendUrl, agentId: result.agentId, token: result.token, computerName };
  saveConfig(config);
  console.log(`Registered as "${computerName}". Config saved.`);
  return config;
}

function backoff(attempt) {
  return Math.min(STREAM_RECONNECT_MIN_MS * 2 ** attempt, STREAM_RECONNECT_MAX_MS);
}

async function main() {
  if (process.argv[2] === "diagnose") {
    await runDiagnostics();
    return;
  }

  console.log(`OOWAPP Local Print Agent v${VERSION}`);
  const config = await ensureConfig();
  const api = createApiClient(config.backendUrl, config.token);
  console.log(`Connected to ${config.backendUrl} as agent ${config.agentId}`);

  const inFlight = new Set();

  async function processJob(job) {
    if (!job || job.status !== "PENDING" || inFlight.has(job.id)) return;
    inFlight.add(job.id);
    try {
      let claimed;
      try {
        claimed = await api.claimJob(job.id);
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) return; // already claimed elsewhere — expected under races
        throw err;
      }

      if (!claimed.systemPrinterName) {
        await api.failJob(job.id, "This printer is not registered to this agent.");
        return;
      }
      if (!claimed.payload) {
        await api.failJob(job.id, `No print payload available for document type ${claimed.documentType}.`);
        return;
      }

      const result = await printRawBytes(claimed.systemPrinterName, claimed.payload);
      if (result.ok) {
        await api.completeJob(job.id);
        console.log(`Printed job ${job.id} on "${claimed.systemPrinterName}".`);
      } else {
        await api.failJob(job.id, result.error);
        console.error(`Print failed for job ${job.id}: ${result.error}`);
      }
    } catch (err) {
      console.error(`Unexpected error handling job ${job.id}:`, err.message ?? err);
      try {
        await api.failJob(job.id, err.message ?? "Unexpected agent error");
      } catch {
        // best-effort — nothing more we can do if even the failure report doesn't land
      }
    } finally {
      inFlight.delete(job.id);
    }
  }

  async function pollOnce() {
    try {
      const jobs = await api.listPendingJobs();
      for (const job of jobs) await processJob(job);
    } catch (err) {
      console.error("Poll failed:", err.message ?? err);
    }
  }

  async function reportPrinters() {
    try {
      const printers = await discoverPrinters();
      await api.reportPrinters(printers);
    } catch (err) {
      console.error("Printer discovery/report failed:", err.message ?? err);
    }
  }

  async function heartbeat() {
    try {
      await api.heartbeat(VERSION);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        console.error("Agent credentials were rejected — re-pair this agent from Printer Settings.");
      } else {
        console.error("Heartbeat failed:", err.message ?? err);
      }
    }
  }

  const controller = new AbortController();
  let shuttingDown = false;

  async function streamLoop() {
    let attempt = 0;
    while (!shuttingDown) {
      try {
        const res = await api.openJobStream(controller.signal);
        if (!res.ok) throw new Error(`Stream request failed with status ${res.status}`);
        console.log("Job stream connected.");
        attempt = 0;
        await consumeSseStream(res, (event) => {
          if (event.type === "print.job.created" || event.type === "print.job.updated") {
            processJob(event.data.job).catch(() => {});
          }
        });
        if (shuttingDown) break;
        console.log("Job stream closed — reconnecting…");
      } catch (err) {
        if (shuttingDown) break;
        console.error("Job stream error:", err.message ?? err);
      }
      const delay = backoff(attempt++);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  await reportPrinters();
  await heartbeat();
  await pollOnce();

  const heartbeatTimer = setInterval(heartbeat, HEARTBEAT_INTERVAL_MS);
  const discoveryTimer = setInterval(reportPrinters, DISCOVERY_INTERVAL_MS);
  const pollTimer = setInterval(pollOnce, POLL_INTERVAL_MS);
  streamLoop();

  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log("Shutting down…");
    clearInterval(heartbeatTimer);
    clearInterval(discoveryTimer);
    clearInterval(pollTimer);
    controller.abort();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
