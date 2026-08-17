import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/api-utils";
import type { PrintJobCreateInput, PrintJobUpdateInput } from "@/lib/validation/printer";

const DUPLICATE_WINDOW_MS = 10_000;

export async function listPrintJobs(shopId: string, limit = 50) {
  return db.printJob.findMany({
    where: { shopId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { printer: { select: { id: true, name: true, connectionType: true } } },
  });
}

/**
 * Creating a job for the same order+documentType while one is already
 * PENDING/PRINTING within the last 10s returns that existing job instead of
 * a new one — the real duplicate-protection backstop behind the UI's own
 * double-click guard (task #11), covering retries/re-renders that fire a
 * second request before the first has settled.
 */
export async function createPrintJob(shopId: string, input: PrintJobCreateInput) {
  if (input.orderId) {
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

  if (input.printerId) {
    const printer = await db.printerProfile.findFirst({ where: { id: input.printerId, shopId } });
    if (!printer) throw new NotFoundError("Printer not found");
  }

  return db.printJob.create({
    data: {
      shopId,
      printerId: input.printerId ?? null,
      documentType: input.documentType,
      orderId: input.orderId ?? null,
      format: input.format,
    },
  });
}

async function assertOwnedPrintJob(shopId: string, id: string) {
  const job = await db.printJob.findFirst({ where: { id, shopId } });
  if (!job) throw new NotFoundError("Print job not found");
  return job;
}

export async function updatePrintJobStatus(shopId: string, id: string, input: PrintJobUpdateInput) {
  const existing = await assertOwnedPrintJob(shopId, id);
  return db.printJob.update({
    where: { id },
    data: {
      status: input.status,
      errorMessage: input.errorMessage ?? null,
      attempts: input.status === "RETRYING" ? existing.attempts + 1 : existing.attempts,
    },
  });
}
