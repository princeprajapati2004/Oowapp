import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { getBalanceSheet } from "@/lib/services/reports/balance-sheet-report";

export async function GET(request: Request) {
  try {
    const session = await requireAdminSession();
    const { searchParams } = new URL(request.url);

    // Point-in-time snapshot — only "to" is meaningful (treated as the "as
    // of" instant); the shared date-range filter bar still sends "from", but
    // it's accepted and ignored here rather than requiring a bespoke
    // single-date UI component.
    const toParam = searchParams.get("to");
    const asOfDate = toParam ? new Date(toParam) : new Date();
    // Match resolveDateRange's convention of an inclusive end-of-day instant.
    asOfDate.setHours(23, 59, 59, 999);

    const data = await getBalanceSheet(session.shopId, asOfDate);
    return NextResponse.json(data);
  } catch (error) {
    return handleApiError(error);
  }
}
