import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { resolveDateRange } from "@/lib/utils/date-range";
import { getProfitReportData, type ProfitReportFilters } from "@/lib/services/reports/profit-report";

export async function GET(request: Request) {
  try {
    const session = await requireAdminSession();
    const { searchParams } = new URL(request.url);

    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    if (!fromParam || !toParam) {
      return NextResponse.json({ error: "from and to date parameters are required" }, { status: 400 });
    }
    const range = resolveDateRange(fromParam, toParam);

    const filters: ProfitReportFilters = {
      from: range.from,
      to: range.to,
      search: searchParams.get("search") || undefined,
      completeOnly: searchParams.get("completeOnly") === "true" || undefined,
    };

    const all = searchParams.get("all") === "true";
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const pageSize = Math.min(Number(searchParams.get("pageSize") ?? 25), 100);

    const { summary, rows, total, truncated } = await getProfitReportData(
      session.shopId,
      filters,
      all ? { all: true } : { page, pageSize }
    );

    return NextResponse.json({
      summary,
      rows,
      total,
      truncated,
      page,
      pageSize,
      range: { from: range.from.toISOString(), to: range.to.toISOString(), label: range.label },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
