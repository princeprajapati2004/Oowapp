import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { resolveDateRange } from "@/lib/utils/date-range";
import {
  getCashBankReportSummary,
  listCashBankReportRows,
  type CashBankReportFilters,
} from "@/lib/services/reports/cash-bank-report";
import type { CashBankBucket } from "@/lib/utils/cash-bank-bucket";

const VALID_BUCKETS = new Set<string>(["CASH", "BANK", "UNKNOWN"]);

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

    const bucketParam = searchParams.get("bucket");
    const bucket: CashBankBucket | "ALL" | undefined =
      bucketParam && VALID_BUCKETS.has(bucketParam) ? (bucketParam as CashBankBucket) : undefined;

    const filters: CashBankReportFilters = {
      from: range.from,
      to: range.to,
      bucket,
      search: searchParams.get("search") || undefined,
    };

    const all = searchParams.get("all") === "true";
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const pageSize = Math.min(Number(searchParams.get("pageSize") ?? 25), 100);

    const [summary, { rows, total, truncated }] = await Promise.all([
      getCashBankReportSummary(session.shopId, filters),
      listCashBankReportRows(session.shopId, filters, all ? { all: true } : { page, pageSize }),
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
