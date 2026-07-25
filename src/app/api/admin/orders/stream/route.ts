import { requireAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { createOrderEventStream } from "@/lib/server/order-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
