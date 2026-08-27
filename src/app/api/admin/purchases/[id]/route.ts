import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { recordPurchasePaymentSchema, cancelPurchaseSchema } from "@/lib/validation/purchase";
import { getPurchaseDetail, recordPurchasePayment, cancelPurchase } from "@/lib/services/purchase";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAdminSession();
    const { id } = await params;
    const purchase = await getPurchaseDetail(session.shopId, id);
    return NextResponse.json(purchase);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAdminSession();
    const { id } = await params;
    const body = await request.json();

    if (body.action === "record_payment") {
      const input = recordPurchasePaymentSchema.parse(body);
      const purchase = await recordPurchasePayment(session.shopId, id, session.adminId, input);
      return NextResponse.json(purchase);
    }

    if (body.action === "cancel") {
      const input = cancelPurchaseSchema.parse(body);
      const purchase = await cancelPurchase(session.shopId, id, session.adminId, input.reason);
      return NextResponse.json(purchase);
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return handleApiError(error);
  }
}
