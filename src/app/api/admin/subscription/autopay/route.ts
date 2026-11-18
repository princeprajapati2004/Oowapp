import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { getCurrentAutoPayMandate } from "@/lib/services/subscription-autopay";

export async function GET() {
  try {
    const session = await requireAdminSession();
    const mandate = await getCurrentAutoPayMandate(session.adminId);
    return NextResponse.json(
      mandate
        ? {
            id: mandate.id,
            planName: mandate.plan.name,
            billingCycle: mandate.billingCycle,
            status: mandate.status,
            createdAt: mandate.createdAt.toISOString(),
          }
        : null
    );
  } catch (error) {
    return handleApiError(error);
  }
}
