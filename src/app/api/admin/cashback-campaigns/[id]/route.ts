import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { cashbackCampaignSchema } from "@/lib/validation/cashback-campaign";
import { updateCashbackCampaign, deleteCashbackCampaign } from "@/lib/services/cashback-campaign";
import { serializeCashbackCampaign } from "@/lib/serialize";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdminSession();
    const { id } = await params;
    const body = await request.json();
    const input = cashbackCampaignSchema.parse(body);
    const campaign = await updateCashbackCampaign(session.shopId, id, input);
    return NextResponse.json(serializeCashbackCampaign(campaign));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdminSession();
    const { id } = await params;
    await deleteCashbackCampaign(session.shopId, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
