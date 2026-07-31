import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { partyPaymentSchema } from "@/lib/validation/party";
import { createPartyPayment } from "@/lib/services/party";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdminSession();
    const { id } = await params;
    const body = await request.json();
    const input = partyPaymentSchema.parse(body);
    const payment = await createPartyPayment(session.shopId, id, session.adminId, input);
    return NextResponse.json(payment, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
