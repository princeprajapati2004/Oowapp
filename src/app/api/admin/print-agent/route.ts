import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { getAgentsForShop } from "@/lib/services/print-agent";

export async function GET() {
  try {
    const session = await requireAdminSession();
    const agents = await getAgentsForShop(session.shopId);
    return NextResponse.json(agents);
  } catch (error) {
    return handleApiError(error);
  }
}
