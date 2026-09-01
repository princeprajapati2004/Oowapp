import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { resolveDateRange } from "@/lib/utils/date-range";
import {
  getCashbookReportSummary,
  listCashbookReportRows,
  type CashbookReportFilters,
} from "@/lib/services/reports/cashbook-report";
import type { CashMovementSource } from "@/lib/services/reports/cash-movements";

const VALID_SOURCES = new Set<string>(["sale_payment", "party_payment", "expense", "refund"]);

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

    const sourceParam = searchParams.get("source");
    const source: CashMovementSource | "ALL" | undefined =
      sourceParam && VALID_SOURCES.has(sourceParam) ? (sourceParam as CashMovementSource) : undefined;

    const filters: CashbookReportFilters = {
      from: range.from,
      to: range.to,
      source,
      search: searchParams.get("search") || undefined,
    };

    const all = searchParams.get("all") === "true";
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const pageSize = Math.min(Number(searchParams.get("pageSize") ?? 25), 100);

    const [summary, { rows, total, truncated }] = await Promise.all([
      getCashbookReportSummary(session.shopId, filters),
      listCashbookReportRows(session.shopId, filters, all ? { all: true } : { page, pageSize }),
    ]);

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
