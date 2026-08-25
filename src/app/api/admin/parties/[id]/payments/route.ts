import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { partyPaymentSchema } from "@/lib/validation/party";
import { createPartyPayment, settlePartyPayment } from "@/lib/services/party";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdminSession();
    const { id } = await params;
    const body = await request.json();
    const input = partyPaymentSchema.parse(body);

    // Settling specific orders is a distinct, richer action from the plain
    // ledger entry below — only meaningful for money coming in.
    if (input.direction === "RECEIVED" && input.orderIds && input.orderIds.length > 0) {
      const settled = await settlePartyPayment(session.shopId, id, session.adminId, {
        amount: input.amount,
        discount: input.discount,
        method: input.method,
        note: input.note,
        orderIds: input.orderIds,
      });
      return NextResponse.json(settled, { status: 201 });
    }

    const payment = await createPartyPayment(session.shopId, id, session.adminId, input);
    return NextResponse.json(payment, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
