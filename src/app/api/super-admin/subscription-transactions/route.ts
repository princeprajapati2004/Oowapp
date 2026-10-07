import { NextResponse } from "next/server";
import { requireSuperAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { listSubscriptionTransactions } from "@/lib/services/subscription-transaction-admin";

export async function GET(request: Request) {
  try {
    await requireSuperAdminSession();
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const status = searchParams.get("status") ?? undefined;

    const result = await listSubscriptionTransactions({ status: status as never, page });
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
