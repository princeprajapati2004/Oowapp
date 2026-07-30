import { handleApiError } from "@/lib/api-utils";
import { requireStaffRole } from "@/lib/staff-session";
import { createOrderEventStream } from "@/lib/server/order-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  let shopId: string;
  try {
    const session = await requireStaffRole("KITCHEN", "MANAGER", "WAITER");
    shopId = session.shopId;
  } catch (error) {
    return handleApiError(error);
  }

  return createOrderEventStream(request, shopId);
}
