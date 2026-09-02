import { db } from "@/lib/db";
import { createPrintJob } from "@/lib/services/print-job";

/**
 * Shop.autoPrintCompletedBill (Settings → Printer Settings) — when on,
 * completing an order queues a bill print on the shop's default printer
 * without the owner touching anything. Fire-and-forget from the order
 * PATCH route, same as the existing push-notification side effect; a
 * printing failure must never fail the order status update itself.
 * idempotencyKey guarantees this only ever queues one job per order even if
 * called twice (e.g. a retried request).
 */
export async function triggerAutoPrintForCompletedOrder(shopId: string, orderId: string): Promise<void> {
  const shop = await db.shop.findUnique({ where: { id: shopId }, select: { autoPrintCompletedBill: true } });
  if (!shop?.autoPrintCompletedBill) return;

  const printer =
    (await db.printerProfile.findFirst({ where: { shopId, isDefault: true, isActive: true } })) ??
    (await db.printerProfile.findFirst({ where: { shopId, isActive: true }, orderBy: { createdAt: "asc" } }));
  if (!printer) return;

  await createPrintJob(shopId, {
    printerId: printer.id,
    documentType: "BILL",
    orderId,
    format: printer.paperSize,
    idempotencyKey: `auto-bill:${orderId}`,
  });
}
