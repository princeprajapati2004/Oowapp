import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { resolveDateRange } from "@/lib/utils/date-range";
import {
  getReferralReportSummary,
  listReferralReportRows,
  type ReferralReportFilters,
  type ReferralReportStatus,
} from "@/lib/services/reports/referral-report";

const VALID_STATUSES: ReferralReportStatus[] = ["PENDING", "REWARDED"];

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

    const statusParam = searchParams.get("status");
    const status = VALID_STATUSES.includes(statusParam as ReferralReportStatus) ? (statusParam as ReferralReportStatus) : undefined;

    const filters: ReferralReportFilters = {
      from: range.from,
      to: range.to,
      search: searchParams.get("search") || undefined,
      status,
    };

    const all = searchParams.get("all") === "true";
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const pageSize = Math.min(Number(searchParams.get("pageSize") ?? 25), 100);

    const [summary, { rows, total, truncated }] = await Promise.all([
      getReferralReportSummary(session.shopId, filters),
      listReferralReportRows(session.shopId, filters, all ? { all: true } : { page, pageSize }),
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
