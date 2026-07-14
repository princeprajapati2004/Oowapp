import { NextResponse } from "next/server";
import { requireSuperAdminSession } from "@/lib/session";
import { PlatformAnalyticsService } from "@/lib/services/platform-analytics";
import { handleApiError } from "@/lib/api-utils";

export async function GET(request: Request) {
  try {
    await requireSuperAdminSession();

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const perPage = Math.min(100, Math.max(1, Number(searchParams.get("perPage") ?? 20)));
    const search = searchParams.get("search") ?? undefined;
    const status = searchParams.get("status") ?? undefined;

    const result = await PlatformAnalyticsService.getBusinessList({
      page,
      perPage,
      search,
      status,
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
