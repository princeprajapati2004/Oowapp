import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { walletAdjustmentSchema } from "@/lib/validation/wallet";
import { adjustWalletManually } from "@/lib/services/wallet";
import { serializeWalletTransaction } from "@/lib/serialize";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAdminSession();
    const { id } = await params;
    const body = await request.json();
    const input = walletAdjustmentSchema.parse(body);
    const transaction = await adjustWalletManually(session.shopId, id, input.amount, input.description || null);
    return NextResponse.json(serializeWalletTransaction(transaction), { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
