import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { getUsageSnapshot } from "@/lib/services/subscription-limits";

export async function GET() {
  try {
    const session = await requireAdminSession();
    const usage = await getUsageSnapshot(session.adminId);
    return NextResponse.json(usage);
  } catch (error) {
    return handleApiError(error);
  }
}
