import { requireAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { createOrderEventStream } from "@/lib/server/order-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Explicit rather than relying on the platform default: the client
// (useOrderEvents) already reconnects with backoff on drop, so a
// deliberate, sub-minute cycle here is safer than an unannounced
// platform-level cutoff mid-stream.
export const maxDuration = 60;

export async function GET(request: Request) {
  let shopId: string;
  try {
    const session = await requireAdminSession();
    shopId = session.shopId;
  } catch (error) {
    return handleApiError(error);
  }

  return createOrderEventStream(request, shopId);
}
