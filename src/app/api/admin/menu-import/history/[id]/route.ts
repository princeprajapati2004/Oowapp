import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { getMenuImport } from "@/lib/services/menu-import";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAdminSession();
    const { id } = await params;
    const record = await getMenuImport(session.shopId, id);
    return NextResponse.json(record);
  } catch (error) {
    return handleApiError(error);
  }
}
