import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handleApiError, NotFoundError } from "@/lib/api-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { toOrderEvent } from "@/lib/server/order-events";
import {
  getActiveDisplayByToken,
  getDisplaySettings,
  statusesForDisplay,
  buildDisplayOrderWhere,
  sanitizeOrderForDisplay,
  touchDisplayConnection,
  type DisplayTypeValue,
} from "@/lib/services/display";

/**
 * Public, session-less snapshot for the /display/[token] page's first paint
 * (and its reconnect/refresh fallback) — live updates after that come from
 * the SSE route alongside this one. No admin/staff auth; the token itself
 * IS the credential, so every response here already goes through the same
 * sanitizeOrderForDisplay() privacy stripping the stream route uses.
 */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (!checkRateLimit(`display:view:${token}`, 60, 60_000) || !checkRateLimit(`display:view:ip:${ip}`, 120, 60_000)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const display = await getActiveDisplayByToken(token);
    if (!display) throw new NotFoundError("This display link is invalid or has been deactivated.");

    const shop = await db.shop.findUnique({
      where: { id: display.shopId },
      select: { businessName: true, logoUrl: true, timezone: true },
    });
    if (!shop) throw new NotFoundError("Display not found");

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

    return NextResponse.json({
      display: {
        id: display.id,
        name: display.name,
        type: display.type,
        allowStaffActions: display.allowStaffActions,
        settings,
      },
      shop,
      orders: orders.map((o: (typeof orders)[number]) => sanitizeOrderForDisplay(toOrderEvent(o), settings)),
      serverTime: now.toISOString(),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
