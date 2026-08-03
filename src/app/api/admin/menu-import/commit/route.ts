import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { menuImportCommitSchema } from "@/lib/validation/menu-import";
import { commitMenuImport } from "@/lib/services/menu-import";

export async function POST(request: Request) {
  try {
    const session = await requireAdminSession();
    const body = await request.json();
    const input = menuImportCommitSchema.parse(body);

    const result = await commitMenuImport(
      session.shopId,
      session.adminId,
      input.sourceType,
      input.fileName ?? null,
      input.items.map((item) => ({
        ...item,
        existingProductId: item.existingProductId ?? null,
        imageUrl: item.imageUrl ?? null,
      }))
    );

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
