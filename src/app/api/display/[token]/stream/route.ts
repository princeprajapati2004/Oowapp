import { NextResponse } from "next/server";
import { handleApiError, NotFoundError } from "@/lib/api-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { createOrderEventStream, type OrderEvent } from "@/lib/server/order-events";
import type { OrderStatus } from "@/generated/prisma/enums";
import {
  getActiveDisplayByToken,
  getDisplaySettings,
  statusesForDisplay,
  sanitizeOrderForDisplay,
  touchDisplayConnection,
  type DisplayTypeValue,
} from "@/lib/services/display";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Same sub-minute cycle as the admin stream — useOrderEvents already
// reconnects with backoff, so a deliberate cutoff here is safer than an
// unannounced platform-level one mid-stream.
export const maxDuration = 60;

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    // New-connection attempts only (the long-lived stream itself isn't
    // re-checked) — generous enough for a tab that reconnects on every drop.
    if (!checkRateLimit(`display:stream:${token}`, 30, 60_000) || !checkRateLimit(`display:stream:ip:${ip}`, 60, 60_000)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const display = await getActiveDisplayByToken(token);
    if (!display) throw new NotFoundError("This display link is invalid or has been deactivated.");

    const type = display.type as DisplayTypeValue;
    const settings = getDisplaySettings(type, display.settings);
    const statuses = new Set(statusesForDisplay(type, settings));

    touchDisplayConnection(display.id);

    return createOrderEventStream(
      request,
      display.shopId,
      (event: OrderEvent) => (event.type === "order.created" || event.type === "order.updated") && statuses.has(event.order.status as OrderStatus),
      (event: OrderEvent) => {
        if (event.type === "order.created" || event.type === "order.updated") {
          return { type: event.type, order: sanitizeOrderForDisplay(event.order, settings) };
        }
        return event;
      }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
