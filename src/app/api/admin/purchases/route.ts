import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { purchaseSchema } from "@/lib/validation/purchase";
import { createPurchase, listPurchases, type PurchaseListFilters } from "@/lib/services/purchase";

export async function GET(request: Request) {
  try {
    const session = await requireAdminSession();
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const pageSize = Math.min(Number(searchParams.get("pageSize") ?? 25), 100);

    const filters: PurchaseListFilters = {
      search: searchParams.get("search") || undefined,
      supplierId: searchParams.get("supplierId") || undefined,
      status: searchParams.get("status") || undefined,
      paymentStatus: searchParams.get("paymentStatus") || undefined,
      from: searchParams.get("from") ? new Date(searchParams.get("from")!) : undefined,
      to: searchParams.get("to") ? new Date(searchParams.get("to")!) : undefined,
    };

    const result = await listPurchases(session.shopId, filters, page, pageSize);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAdminSession();
    const body = await request.json();
    const input = purchaseSchema.parse(body);
    const purchase = await createPurchase(session.shopId, session.adminId, input);
    return NextResponse.json(purchase, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
