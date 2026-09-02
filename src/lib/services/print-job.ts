import { db } from "@/lib/db";
import { NotFoundError, ConflictError } from "@/lib/api-utils";
import { ForbiddenError } from "@/lib/session";
import { publishOrderEvent, toPrintJobEvent } from "@/lib/server/order-events";
import { buildAgentPrintPayload } from "@/lib/services/print-payload";
import type { PrintJobCreateInput, PrintJobUpdateInput } from "@/lib/validation/printer";
import type { PrinterConnectionType, PrintJobStatus } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

const DUPLICATE_WINDOW_MS = 10_000;

/** Agent-facing job responses always carry the physical printer name to send bytes to — the agent has no other way to resolve printerId -> its own OS printer name. */
function withSystemPrinterName<T extends { printer?: { systemPrinterName: string | null } | null }>(
  job: T
): Omit<T, "printer"> & { systemPrinterName: string | null } {
  const { printer, ...rest } = job;
  return { ...rest, systemPrinterName: printer?.systemPrinterName ?? null };
}

export async function listPrintJobs(shopId: string, limit = 50) {
  return db.printJob.findMany({
    where: { shopId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { printer: { select: { id: true, name: true, connectionType: true } } },
  });
}

async function assertOwnedPrintJob(shopId: string, id: string) {
  const job = await db.printJob.findFirst({ where: { id, shopId } });
  if (!job) throw new NotFoundError("Print job not found");
  return job;
}

export const getPrintJob = assertOwnedPrintJob;

/**
 * Creating a job for the same order+documentType while one is already
 * PENDING/PRINTING within the last 10s returns that existing job instead of
 * a new one — the real duplicate-protection backstop behind the UI's own
 * double-click guard, covering retries/re-renders that fire a second
 * request before the first has settled. When the caller supplies
 * `idempotencyKey` (e.g. auto-print-on-order-completion), that's a stronger,
 * unbounded-in-time guarantee: a second create with the same key always
 * returns the original job, full stop.
 *
 * When the target printer is agent-backed (printer.agentId set), the
 * receipt is rendered to ESC/POS bytes right here, server-side, and stored
 * on the job — the agent has no browser/DOM to build it itself. See
 * print-payload.ts.
 */
export async function createPrintJob(shopId: string, input: PrintJobCreateInput) {
  if (input.idempotencyKey) {
    const existing = await db.printJob.findUnique({
      where: { shopId_idempotencyKey: { shopId, idempotencyKey: input.idempotencyKey } },
    });
    if (existing) return existing;
  } else if (input.orderId) {
    const since = new Date(Date.now() - DUPLICATE_WINDOW_MS);
    const duplicate = await db.printJob.findFirst({
      where: {
        shopId,
        orderId: input.orderId,
        documentType: input.documentType,
        status: { in: ["PENDING", "PRINTING"] },
        createdAt: { gte: since },
      },
      orderBy: { createdAt: "desc" },
    });
    if (duplicate) return duplicate;
  }

  let printer: {
    id: string;
    agentId: string | null;
    name: string;
    connectionType: PrinterConnectionType;
    systemPrinterName: string | null;
  } | null = null;
  if (input.printerId) {
    printer = await db.printerProfile.findFirst({
      where: { id: input.printerId, shopId },
      select: { id: true, agentId: true, name: true, connectionType: true, systemPrinterName: true },
    });
    if (!printer) throw new NotFoundError("Printer not found");
  }

  let payload: string | null = null;
  if (printer?.agentId) {
    payload = await buildAgentPrintPayload({
      shopId,
      documentType: input.documentType,
      orderId: input.orderId ?? null,
      format: input.format,
      printerName: printer.name,
      printerConnectionType: printer.connectionType,
    });
  }

  const job = await db.printJob.create({
    data: {
      shopId,
      printerId: input.printerId ?? null,
      agentId: printer?.agentId ?? null,
      documentType: input.documentType,
      orderId: input.orderId ?? null,
      format: input.format,
      idempotencyKey: input.idempotencyKey ?? null,
      payload,
    },
  });

  publishOrderEvent(shopId, {
    type: "print.job.created",
    job: toPrintJobEvent({ ...job, systemPrinterName: printer?.systemPrinterName ?? null }, job.agentId != null),
  });
  return job;
}

export async function updatePrintJobStatus(shopId: string, id: string, input: PrintJobUpdateInput) {
  const existing = await assertOwnedPrintJob(shopId, id);
  const job = await db.printJob.update({
    where: { id },
    data: {
      status: input.status,
      errorMessage: input.errorMessage ?? null,
      attempts: input.status === "RETRYING" ? existing.attempts + 1 : existing.attempts,
    },
  });
  publishOrderEvent(shopId, { type: "print.job.updated", job: toPrintJobEvent(job) });
  return job;
}

// ─── Agent-side lifecycle ───────────────────────────────────────────────────
// Each transition is a conditional update (`updateMany` scoped to the exact
// prior status) rather than a blind write — two overlapping claim attempts
// for the same job (a retried request, a slow poll racing the SSE push) can
// never both succeed, which is the actual duplicate-print protection; there
// is no separate "lock" table.

async function transitionAgentJob(
  agentId: string,
  jobId: string,
  fromStatuses: PrintJobStatus[],
  data: Prisma.PrintJobUpdateManyMutationInput
) {
  const job = await db.printJob.findFirst({ where: { id: jobId } });
  if (!job) throw new NotFoundError("Print job not found");
  if (job.agentId !== agentId) throw new ForbiddenError("This job is not assigned to your agent");
  if (!fromStatuses.includes(job.status)) {
    throw new ConflictError(`Job is already ${job.status.toLowerCase()}`);
  }

  const result = await db.printJob.updateMany({
    where: { id: jobId, agentId, status: { in: fromStatuses } },
    data,
  });
  if (result.count === 0) {
    // Lost the race to a concurrent transition (e.g. a duplicate claim
    // attempt) — re-read so the caller gets an accurate current state.
    const current = await db.printJob.findUniqueOrThrow({ where: { id: jobId } });
    throw new ConflictError(`Job is already ${current.status.toLowerCase()}`);
  }

  const updated = await db.printJob.findUniqueOrThrow({
    where: { id: jobId },
    include: { printer: { select: { systemPrinterName: true } } },
  });
  publishOrderEvent(updated.shopId, { type: "print.job.updated", job: toPrintJobEvent(updated) });
  return withSystemPrinterName(updated);
}

export function claimPrintJob(agentId: string, jobId: string) {
  return transitionAgentJob(agentId, jobId, ["PENDING"], { status: "PRINTING", claimedAt: new Date() });
}

export function completePrintJob(agentId: string, jobId: string) {
  return transitionAgentJob(agentId, jobId, ["PRINTING"], { status: "COMPLETED" });
}

export function failPrintJob(agentId: string, jobId: string, errorMessage: string) {
  return transitionAgentJob(agentId, jobId, ["PENDING", "PRINTING"], { status: "FAILED", errorMessage });
}

export async function listPendingJobsForAgent(agentId: string) {
  const jobs = await db.printJob.findMany({
    where: { agentId, status: "PENDING" },
    orderBy: { createdAt: "asc" },
    include: { printer: { select: { systemPrinterName: true } } },
  });
  return jobs.map(withSystemPrinterName);
}
