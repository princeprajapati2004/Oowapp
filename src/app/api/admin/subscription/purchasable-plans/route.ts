import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { getPurchasablePlans } from "@/lib/services/subscription-checkout";

// Client-fetchable version of what /admin/subscription/page.tsx computes
// server-side — needed by the global subscription-gate (src/components/
// shared/subscription-gate.tsx), which can pop up from anywhere, not just
// that page's own server-rendered load.
export async function GET() {
  try {
    const session = await requireAdminSession();
    const plans = await getPurchasablePlans(session.adminId);
    return NextResponse.json(plans);
  } catch (error) {
    return handleApiError(error);
  }
}
