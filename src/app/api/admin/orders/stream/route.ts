import { requireAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { subscribeOrderEvents, type OrderEvent } from "@/lib/server/order-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEARTBEAT_INTERVAL_MS = 20_000;

export async function GET(request: Request) {
  let shopId: string;
  try {
    const session = await requireAdminSession();
    shopId = session.shopId;
  } catch (error) {
    return handleApiError(error);
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;

      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          // Controller already closed by the time this event fired — ignore.
        }
      };

      send("connected", { ok: true });

      const unsubscribe = subscribeOrderEvents(shopId, (event: OrderEvent) => {
        send(event.type, event);
      });

      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          // ignore — cleanup happens on abort
        }
      }, HEARTBEAT_INTERVAL_MS);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      request.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Reverse proxies (nginx) buffer streamed responses by default, which
      // would delay every event until the buffer fills — disable it.
      "X-Accel-Buffering": "no",
    },
  });
}
