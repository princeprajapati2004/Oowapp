import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { listMenuImports } from "@/lib/services/menu-import";

export async function GET() {
  try {
    const session = await requireAdminSession();
    const imports = await listMenuImports(session.shopId);
    return NextResponse.json(imports);
  } catch (error) {
    return handleApiError(error);
  }
}
