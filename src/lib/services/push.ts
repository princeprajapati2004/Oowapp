import { db } from "@/lib/db";

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

function isVapidConfigured() {
  return !!(
    process.env.VAPID_PUBLIC_KEY &&
    process.env.VAPID_PRIVATE_KEY &&
    process.env.VAPID_SUBJECT
  );
}

async function getWebPush() {
  if (!isVapidConfigured()) return null;
  try {
    const webpush = (await import("web-push")).default;
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT!,
      process.env.VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!
    );
    return webpush;
  } catch {
    return null;
  }
}

export async function sendPushToShop(shopId: string, payload: PushPayload): Promise<void> {
  const webpush = await getWebPush();
  if (!webpush) return;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subs = await (db.pushSubscription as any).findMany({ where: { shopId } });
  if (!subs.length) return;

  const notification = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url ?? "/admin/orders",
    tag: payload.tag,
  });

  await Promise.allSettled(
    subs.map(async (sub: { endpoint: string; p256dh: string; auth: string; id: string }) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          notification
        );
      } catch (err: unknown) {
        // Remove stale subscriptions (HTTP 410 Gone)
        if (
          err &&
          typeof err === "object" &&
          "statusCode" in err &&
          (err as { statusCode: number }).statusCode === 410
        ) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (db.pushSubscription as any).delete({ where: { id: sub.id } }).catch(() => {});
        }
      }
    })
  );
}

export async function sendNewOrderNotification(
  shopId: string,
  opts: { billNumber: string; customerName?: string | null; grandTotal: number; currency: string; orderId: string }
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prefs = await (db.shop as any).findUnique({
    where: { id: shopId },
    select: { notifyNewOrders: true },
  });
  if (prefs?.notifyNewOrders === false) return;

  const parts: string[] = [];
  if (opts.customerName) parts.push(`Customer: ${opts.customerName}`);
  const amount = new Intl.NumberFormat("en-IN", { style: "currency", currency: opts.currency }).format(opts.grandTotal);
  parts.push(`Amount: ${amount}`);

  await sendPushToShop(shopId, {
    title: `New Order #${opts.billNumber}`,
    body: parts.join(" | "),
    url: `/admin/orders/${opts.orderId}`,
    tag: `order-${opts.orderId}`,
  });
}

export async function sendOrderStatusNotification(
  shopId: string,
  opts: { billNumber: string; status: string; orderId: string }
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prefs = await (db.shop as any).findUnique({
    where: { id: shopId },
    select: { notifyOrderUpdates: true },
  });
  if (prefs?.notifyOrderUpdates === false) return;

  await sendPushToShop(shopId, {
    title: `Order #${opts.billNumber} — ${opts.status}`,
    body: `Status updated to ${opts.status.toLowerCase()}`,
    url: `/admin/orders/${opts.orderId}`,
    tag: `order-${opts.orderId}`,
  });
}
