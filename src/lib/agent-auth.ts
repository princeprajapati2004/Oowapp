import crypto from "crypto";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { UnauthorizedError } from "@/lib/session";

// ─── Pairing codes ──────────────────────────────────────────────────────────
// Short, human-typeable codes the owner generates from Printer Settings and
// enters into the Local Print Agent during first-run setup. Excludes visually
// ambiguous characters (0/O, 1/I/L).
const PAIRING_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const PAIRING_CODE_LENGTH = 8;
export const PAIRING_CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export function generatePairingCode(): string {
  const bytes = crypto.randomBytes(PAIRING_CODE_LENGTH);
  let code = "";
  for (let i = 0; i < PAIRING_CODE_LENGTH; i++) {
    code += PAIRING_CODE_ALPHABET[bytes[i] % PAIRING_CODE_ALPHABET.length];
  }
  return code;
}

// ─── Agent bearer secrets ───────────────────────────────────────────────────
// The agent authenticates every request with `Authorization: Bearer
// <agentId>.<secret>`. Only secretHash (bcrypt) is ever persisted — the
// plaintext secret is returned once, at registration time, and the agent is
// responsible for storing it locally (see print-agent/config.js).

export function generateAgentSecret(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function hashAgentSecret(secret: string): Promise<string> {
  return bcrypt.hash(secret, 10);
}

export function formatAgentToken(agentId: string, secret: string): string {
  return `${agentId}.${secret}`;
}

function parseAgentToken(token: string): { agentId: string; secret: string } | null {
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;
  return { agentId: token.slice(0, dot), secret: token.slice(dot + 1) };
}

export interface AgentSessionPayload {
  agentId: string;
  shopId: string;
}

function extractBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header || !header.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token || null;
}

/**
 * Verifies the agent's bearer token against its stored secretHash and
 * confirms the PrintAgent row still exists. Does NOT check status/lastSeenAt
 * — callers that need "must currently be online" should check that
 * separately; this only proves "this is a legitimate, previously-registered
 * agent for this shop."
 */
export async function requireAgentSession(request: Request): Promise<AgentSessionPayload> {
  const token = extractBearerToken(request);
  if (!token) throw new UnauthorizedError("Missing agent credentials");

  const parsed = parseAgentToken(token);
  if (!parsed) throw new UnauthorizedError("Malformed agent credentials");

  const agent = await db.printAgent.findUnique({
    where: { id: parsed.agentId },
    select: { id: true, shopId: true, secretHash: true },
  });
  if (!agent) throw new UnauthorizedError("Unknown agent");

  const valid = await bcrypt.compare(parsed.secret, agent.secretHash);
  if (!valid) throw new UnauthorizedError("Invalid agent credentials");

  return { agentId: agent.id, shopId: agent.shopId };
}
