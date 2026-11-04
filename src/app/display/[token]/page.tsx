import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { toOrderEvent } from "@/lib/server/order-events";
import { isAccountAccessBlocked } from "@/lib/services/subscription";
import {
  getActiveDisplayByToken,
  getDisplaySettings,
  statusesForDisplay,
  buildDisplayOrderWhere,
  sanitizeOrderForDisplay,
  touchDisplayConnection,
  type DisplayTypeValue,
} from "@/lib/services/display";
import { PublicDisplayBoard } from "@/components/display/public-display-board";
import { SubscriptionExpiredScreen } from "@/components/shared/subscription-expired-screen";

export default async function PublicDisplayPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const display = await getActiveDisplayByToken(token);
  if (!display) notFound();

  const shop = await db.shop.findUnique({
    where: { id: display.shopId },
    select: { adminId: true, businessName: true, logoUrl: true, timezone: true },
  });
  if (!shop) notFound();

  if (await isAccountAccessBlocked(shop.adminId)) {
    return <SubscriptionExpiredScreen variant="customer" />;
  }

  const type = display.type as DisplayTypeValue;
  const settings = getDisplaySettings(type, display.settings);
  const statuses = statusesForDisplay(type, settings);
  const now = new Date();

  const orders = await db.order.findMany({
    where: buildDisplayOrderWhere(display.shopId, statuses, settings, now),
    orderBy: { createdAt: "asc" },
    include: { items: true },
    take: settings.activeOrderLimit,
  });

  touchDisplayConnection(display.id);

  return (
    <PublicDisplayBoard
      token={token}
      displayId={display.id}
      displayName={display.name}
      type={type}
      allowStaffActions={display.allowStaffActions}
      settings={settings}
      shopName={shop.businessName}
      shopLogoUrl={shop.logoUrl}
      initialOrders={orders.map((o: (typeof orders)[number]) => sanitizeOrderForDisplay(toOrderEvent(o), settings))}
    />
  );
}
