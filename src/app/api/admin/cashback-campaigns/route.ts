import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { cashbackCampaignSchema } from "@/lib/validation/cashback-campaign";
import { listCashbackCampaigns, createCashbackCampaign } from "@/lib/services/cashback-campaign";
import { serializeCashbackCampaigns, serializeCashbackCampaign } from "@/lib/serialize";

export async function GET() {
  try {
    const session = await requireAdminSession();
    const campaigns = await listCashbackCampaigns(session.shopId);
    return NextResponse.json(serializeCashbackCampaigns(campaigns));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAdminSession();
    const body = await request.json();
    const input = cashbackCampaignSchema.parse(body);
    const campaign = await createCashbackCampaign(session.shopId, input);
    return NextResponse.json(serializeCashbackCampaign(campaign), { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
