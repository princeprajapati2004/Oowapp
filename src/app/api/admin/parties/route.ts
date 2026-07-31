import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { partySchema } from "@/lib/validation/party";
import { listPartiesWithBalances, createParty } from "@/lib/services/party";

export async function GET() {
  try {
    const session = await requireAdminSession();
    const parties = await listPartiesWithBalances(session.shopId);
    return NextResponse.json(parties);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAdminSession();
    const body = await request.json();
    const input = partySchema.parse(body);
    const party = await createParty(session.shopId, input);
    return NextResponse.json(party, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
