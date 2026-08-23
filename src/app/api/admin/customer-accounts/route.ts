import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { listCustomerAccounts } from "@/lib/services/wallet";
import { serializeCustomerAccounts } from "@/lib/serialize";

export async function GET(request: Request) {
  try {
    const session = await requireAdminSession();
    const search = new URL(request.url).searchParams.get("search") ?? undefined;
    const customers = await listCustomerAccounts(session.shopId, search);
    return NextResponse.json(serializeCustomerAccounts(customers));
  } catch (error) {
    return handleApiError(error);
  }
}
