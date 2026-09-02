import { db } from "@/lib/db";
import { NotFoundError, ConflictError } from "@/lib/api-utils";
import { UnauthorizedError } from "@/lib/session";
import {
  generatePairingCode,
  generateAgentSecret,
  hashAgentSecret,
  formatAgentToken,
  PAIRING_CODE_TTL_MS,
} from "@/lib/agent-auth";
import type { AgentRegisterInput, AgentPrinterReportInput } from "@/lib/validation/print-agent";

// An agent that hasn't sent a heartbeat within this window is treated as
// OFFLINE for display purposes even if its last-written `status` says
// otherwise — there's no cron job flipping this at rest, so it's derived
// at read time. Agents are expected to heartbeat roughly every 20s.
const STALE_AFTER_MS = 60_000;

export function isAgentOnline(agent: { status: string; lastSeenAt: Date | null }): boolean {
  if (agent.status !== "ONLINE" || !agent.lastSeenAt) return false;
  return Date.now() - agent.lastSeenAt.getTime() < STALE_AFTER_MS;
}

export async function createPairingCode(shopId: string) {
  const code = generatePairingCode();
  const expiresAt = new Date(Date.now() + PAIRING_CODE_TTL_MS);
  await db.printAgentPairingCode.create({ data: { shopId, code, expiresAt } });
  return { code, expiresAt };
}

/**
 * Consumes a pairing code and creates (or re-authorizes) the PrintAgent.
 * Single-use: `usedAt` is set in the same transaction that reads the code,
 * so two near-simultaneous register attempts with the same code can't both
 * succeed.
 */
export async function registerAgent(input: AgentRegisterInput) {
  const secret = generateAgentSecret();
  const secretHash = await hashAgentSecret(secret);

  const agent = await db.$transaction(async (tx) => {
    const pairing = await tx.printAgentPairingCode.findUnique({ where: { code: input.pairingCode } });
    if (!pairing) throw new NotFoundError("Invalid pairing code");
    if (pairing.usedAt) throw new ConflictError("Pairing code already used");
    if (pairing.expiresAt.getTime() < Date.now()) throw new ConflictError("Pairing code expired");

    await tx.printAgentPairingCode.update({ where: { id: pairing.id }, data: { usedAt: new Date() } });

    return tx.printAgent.create({
      data: {
        shopId: pairing.shopId,
        name: input.computerName,
        computerName: input.computerName,
        secretHash,
        version: input.version ?? null,
        status: "ONLINE",
        lastSeenAt: new Date(),
      },
    });
  });

  return { agent, token: formatAgentToken(agent.id, secret) };
}

export async function recordHeartbeat(agentId: string, version: string | null | undefined) {
  return db.printAgent.update({
    where: { id: agentId },
    data: {
      status: "ONLINE",
      lastSeenAt: new Date(),
      ...(version !== undefined ? { version } : {}),
    },
  });
}

/**
 * Reconciles the agent's full current printer inventory: reported printers
 * are upserted (matched on the agentId+systemPrinterName unique key) and
 * marked CONNECTED; anything previously reported by this agent but absent
 * from this report is flipped to DISCONNECTED (unplugged/uninstalled), never
 * deleted, so job history and owner-picked defaults survive a printer going
 * away temporarily.
 */
export async function reportDiscoveredPrinters(
  agentId: string,
  shopId: string,
  input: AgentPrinterReportInput
) {
  const seenNames = input.printers.map((p) => p.systemPrinterName);

  await db.$transaction(async (tx) => {
    for (const printer of input.printers) {
      // `reachable === false` means the agent actually tried to open this
      // target (e.g. a Bluetooth SPP port) and it failed right now — being
      // paired/present in Windows is not the same as being reachable, so
      // that must never be reported CONNECTED. Anything not actively
      // probed (reachable undefined — e.g. a normal Windows printer queue)
      // keeps the original "presence is enough" behavior.
      const status = printer.reachable === false ? "DISCONNECTED" : "CONNECTED";
      await tx.printerProfile.upsert({
        where: { agentId_systemPrinterName: { agentId, systemPrinterName: printer.systemPrinterName } },
        create: {
          shopId,
          agentId,
          systemPrinterName: printer.systemPrinterName,
          name: printer.label ?? printer.systemPrinterName,
          connectionType: printer.connectionType,
          paperSize: "THERMAL_80",
          status,
          ...(status === "CONNECTED" ? { lastConnectedAt: new Date() } : {}),
        },
        update: {
          connectionType: printer.connectionType,
          status,
          ...(status === "CONNECTED" ? { lastConnectedAt: new Date() } : {}),
        },
      });
    }

    await tx.printerProfile.updateMany({
      where: {
        agentId,
        systemPrinterName: { notIn: seenNames.length > 0 ? seenNames : [""] },
      },
      data: { status: "DISCONNECTED" },
    });
  });

  return listAgentPrinters(agentId);
}

function listAgentPrinters(agentId: string) {
  return db.printerProfile.findMany({ where: { agentId }, orderBy: { name: "asc" } });
}

/** Owner-facing view for Printer Settings — every agent registered for this shop, each with its current printer inventory. */
export async function getAgentsForShop(shopId: string) {
  const agents = await db.printAgent.findMany({
    where: { shopId },
    include: { printers: { orderBy: { name: "asc" } } },
    orderBy: { createdAt: "asc" },
  });
  return agents.map((agent) => ({ ...agent, online: isAgentOnline(agent) }));
}

export async function assertAgentBelongsToShop(agentId: string, shopId: string) {
  const agent = await db.printAgent.findFirst({ where: { id: agentId, shopId } });
  if (!agent) throw new UnauthorizedError("Agent does not belong to this shop");
  return agent;
}
