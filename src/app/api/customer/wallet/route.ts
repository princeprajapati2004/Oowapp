import { NextResponse } from "next/server";
import { requireCustomerSession } from "@/lib/customer-session";
import { getWalletSummary } from "@/lib/services/wallet";
import { serializeWalletTransactions } from "@/lib/serialize";
import { handleApiError } from "@/lib/api-utils";

export async function GET() {
  try {
    const session = await requireCustomerSession();
    const { balance, transactions } = await getWalletSummary(session.shopId, session.customerId);
    return NextResponse.json({ balance, transactions: serializeWalletTransactions(transactions) });
  } catch (error) {
    return handleApiError(error);
  }
}
