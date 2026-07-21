import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { getDashboardAnalytics, type Granularity } from "@/lib/services/analytics";

function getDateRange(period: string, from?: string, to?: string): { from: Date; to: Date; granularity: Granularity } {
  const now = new Date();

  if (period === "today") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    return { from: start, to: end, granularity: "hour" };
  }

  if (period === "yesterday") {
    const start = new Date(now);
    start.setDate(start.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);
    return { from: start, to: end, granularity: "hour" };
  }

  if (period === "7d") {
    const start = new Date(now);
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    return { from: start, to: now, granularity: "day" };
  }

  if (period === "30d") {
    const start = new Date(now);
    start.setDate(start.getDate() - 29);
    start.setHours(0, 0, 0, 0);
    return { from: start, to: now, granularity: "day" };
  }

  if (period === "this_month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: start, to: now, granularity: "day" };
  }

  if (period === "last_month") {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    return { from: start, to: end, granularity: "day" };
  }

  if (period === "12m") {
    const start = new Date(now.getFullYear() - 1, now.getMonth() + 1, 1);
    return { from: start, to: now, granularity: "month" };
  }

  if (period === "custom" && from && to) {
    const f = new Date(from);
    const t = new Date(to);
    t.setHours(23, 59, 59, 999);
    const diffDays = Math.ceil((t.getTime() - f.getTime()) / 86_400_000);
    const granularity: Granularity = diffDays <= 2 ? "hour" : diffDays <= 90 ? "day" : "month";
    return { from: f, to: t, granularity };
  }

  // default: today
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return { from: start, to: now, granularity: "hour" };
}

export async function GET(request: Request) {
  try {
    const session = await requireAdminSession();
    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") ?? "today";
    const fromParam = searchParams.get("from") ?? undefined;
    const toParam = searchParams.get("to") ?? undefined;

    const { from, to, granularity } = getDateRange(period, fromParam, toParam);
    const data = await getDashboardAnalytics(session.shopId, from, to, granularity);

    return NextResponse.json({ ...data, period, granularity, from: from.toISOString(), to: to.toISOString() });
  } catch (error) {
    return handleApiError(error);
  }
}
