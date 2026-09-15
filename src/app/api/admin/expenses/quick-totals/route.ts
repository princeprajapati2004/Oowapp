import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/session";
import { assertFeatureEnabled } from "@/lib/services/feature-permission";
import { handleApiError } from "@/lib/api-utils";
import { getExpenseQuickTotals } from "@/lib/services/expense";

export async function GET() {
  try {
    const session = await requireAdminSession();
    await assertFeatureEnabled(session.shopId, "expenses");
    const totals = await getExpenseQuickTotals(session.shopId);
    return NextResponse.json(totals);
  } catch (error) {
    return handleApiError(error);
  }
}
