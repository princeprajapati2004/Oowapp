import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { listPartyPricesForProduct, setPartyPrice } from "@/lib/services/party-pricing";
import { partyPriceSchema } from "@/lib/validation/party-pricing";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdminSession();
    const { id } = await params;
    const rows = await listPartyPricesForProduct(session.shopId, id);
    return NextResponse.json(rows);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdminSession();
    const { id } = await params;
    const body = await request.json();
    const input = partyPriceSchema.parse(body);
    const row = await setPartyPrice(session.shopId, id, input.partyId, input.price);
    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
