#!/usr/bin/env node
// OOWAPP Local Print Bridge
//
// What this is for: browsers cannot open a raw TCP socket, and most
// network ("Wi-Fi") thermal printers only speak raw ESC/POS bytes over a
// plain TCP socket on port 9100 — there is no browser API that reaches
// them directly. This is a small standalone Node process, run separately
// from the Next.js app, that the browser talks to over local HTTP; it
// converts those requests into real net.Socket TCP connections to the
// printer and reports back what actually happened. No simulated sockets,
// no fabricated "connected" status — every /printers entry reflects a
// real socket this process is holding open right now.
//
// Run it with:  node bridge/server.mjs   (or  npm run bridge)
//
// Security model:
//   - Binds to 127.0.0.1 only — never reachable from the network, only
//     from processes on this machine (i.e. the browser on this computer).
//   - A random token is generated on first run and stored next to this
//     file (token.local.txt, gitignored). Every request except /health
//     must send it as "Authorization: Bearer <token>". Paste this token
//     into Printer Settings when adding a Wi-Fi printer that uses the
//     bridge. Loopback-only binding is the primary defense; the token
//     stops any other local process/page from issuing print jobs even so.

import http from "node:http";
import net from "node:net";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.OOWAPP_BRIDGE_PORT || 9743);
const HOST = "127.0.0.1";
const TOKEN_FILE = path.join(__dirname, "token.local.txt");
const CONNECT_TIMEOUT_MS = 4000;
const MAX_BODY_BYTES = 5_000_000; // a receipt is a few KB; refuse anything absurd
const VERSION = "1.0.0";

function loadOrCreateToken() {
  if (fs.existsSync(TOKEN_FILE)) {
    const existing = fs.readFileSync(TOKEN_FILE, "utf8").trim();
    if (existing) return existing;
  }
  const token = crypto.randomBytes(24).toString("hex");
  fs.writeFileSync(TOKEN_FILE, token, { mode: 0o600 });
  return token;
}

const TOKEN = loadOrCreateToken();

/**
 * @typedef {{ ip: string, port: number, socket: import("node:net").Socket | null, status: "CONNECTING"|"CONNECTED"|"DISCONNECTED"|"ERROR", lastError: string | null, connectedAt: string | null }} RegistryEntry
 * @type {Map<string, RegistryEntry>}
 */
const registry = new Map();

/** Opens a real TCP connection to ip:port and tracks it in the registry under id. */
function connectSocket(id, ip, port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const entry = registry.get(id) ?? { ip, port, socket: null, status: "CONNECTING", lastError: null, connectedAt: null };
    entry.ip = ip;
    entry.port = port;
    entry.status = "CONNECTING";
    entry.lastError = null;
    registry.set(id, entry);

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      socket.destroy();
      entry.status = "ERROR";
      entry.lastError = "Connection timed out";
      resolve({ ok: false, error: "Connection timed out" });
    }, CONNECT_TIMEOUT_MS);

    socket.once("connect", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      entry.socket = socket;
      entry.status = "CONNECTED";
      entry.connectedAt = new Date().toISOString();
      resolve({ ok: true });
    });

    socket.once("error", (err) => {
      entry.status = "ERROR";
      entry.lastError = err.message;
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({ ok: false, error: err.message });
      }
    });

    socket.once("close", () => {
      if (entry.socket === socket) {
        entry.socket = null;
        if (entry.status !== "ERROR") entry.status = "DISCONNECTED";
      }
    });

    socket.connect(port, ip);
  });
}

/** If the held socket has dropped, makes one honest reconnect attempt before giving up. */
async function ensureConnected(id) {
  const entry = registry.get(id);
  if (!entry) return { ok: false, error: "Unknown printer id — call /printers/connect first." };
  if (entry.status === "CONNECTED" && entry.socket && !entry.socket.destroyed) return { ok: true };
  return connectSocket(id, entry.ip, entry.port);
}

function writeToSocket(id, buffer) {
  return new Promise((resolve) => {
    const entry = registry.get(id);
    if (!entry?.socket || entry.socket.destroyed) {
      resolve({ ok: false, error: "Printer is not connected." });
      return;
    }
    entry.socket.write(buffer, (err) => {
      if (err) {
        entry.status = "ERROR";
        entry.lastError = err.message;
        resolve({ ok: false, error: err.message });
      } else {
        resolve({ ok: true, bytesWritten: buffer.length });
      }
    });
  });
}

function send(res, status, body, origin) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    Vary: "Origin",
  });
  res.end(JSON.stringify(body));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > MAX_BODY_BYTES) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  const url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);

  if (req.method === "OPTIONS") {
    send(res, 204, {}, origin);
    return;
  }

  if (req.method === "GET" && url.pathname === "/health") {
    send(res, 200, { ok: true, version: VERSION }, origin);
    return;
  }

  if (req.headers.authorization !== `Bearer ${TOKEN}`) {
    send(res, 401, { ok: false, error: "UNAUTHORIZED" }, origin);
    return;
  }

  try {
    if (req.method === "GET" && url.pathname === "/printers") {
      const printers = Array.from(registry.entries()).map(([id, e]) => ({
        id,
        ip: e.ip,
        port: e.port,
        status: e.status,
        lastError: e.lastError,
        connectedAt: e.connectedAt,
      }));
      send(res, 200, { ok: true, printers }, origin);
      return;
    }

    if (req.method === "POST" && url.pathname === "/printers/connect") {
      const body = await readJsonBody(req);
      const { id, ip, port } = body;
      if (!id || !ip || !port) {
        send(res, 400, { ok: false, error: "id, ip, and port are required" }, origin);
        return;
      }
      const result = await connectSocket(String(id), String(ip), Number(port));
      send(res, result.ok ? 200 : 502, { ...result, status: registry.get(String(id))?.status }, origin);
      return;
    }

    const printMatch = url.pathname.match(/^\/printers\/([^/]+)\/print$/);
    if (req.method === "POST" && printMatch) {
      const id = decodeURIComponent(printMatch[1]);
      const body = await readJsonBody(req);
      if (!body.dataBase64) {
        send(res, 400, { ok: false, error: "dataBase64 is required" }, origin);
        return;
      }
      const reconnect = await ensureConnected(id);
      if (!reconnect.ok) {
        send(res, 502, reconnect, origin);
        return;
      }
      const buffer = Buffer.from(body.dataBase64, "base64");
      const result = await writeToSocket(id, buffer);
      send(res, result.ok ? 200 : 502, result, origin);
      return;
    }

    const disconnectMatch = url.pathname.match(/^\/printers\/([^/]+)\/disconnect$/);
    if (req.method === "POST" && disconnectMatch) {
      const id = decodeURIComponent(disconnectMatch[1]);
      const entry = registry.get(id);
      if (entry?.socket) entry.socket.destroy();
      registry.delete(id);
      send(res, 200, { ok: true }, origin);
      return;
    }

    send(res, 404, { ok: false, error: "Not found" }, origin);
  } catch (err) {
    send(res, 500, { ok: false, error: err instanceof Error ? err.message : String(err) }, origin);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`OOWAPP Local Print Bridge v${VERSION}`);
  console.log(`Listening on http://${HOST}:${PORT} (loopback only — not reachable from the network)`);
  console.log(`Bridge token (paste into Printer Settings when adding a Wi-Fi printer):`);
  console.log(`  ${TOKEN}`);
  console.log(`Token stored at: ${TOKEN_FILE}`);
});
