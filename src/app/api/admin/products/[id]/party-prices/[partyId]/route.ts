import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { removePartyPrice } from "@/lib/services/party-pricing";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; partyId: string }> }
) {
  try {
    const session = await requireAdminSession();
    const { id, partyId } = await params;
    await removePartyPrice(session.shopId, id, partyId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
