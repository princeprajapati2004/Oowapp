import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { productPatchSchema } from "@/lib/validation/product";
import { updateProduct, deleteProduct } from "@/lib/services/product";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdminSession();
    const { id } = await params;
    const body = await request.json();
    // Partial schema — callers only send the keys they're changing (e.g. the
    // products list's inline availability toggle sends just
    // `{ isAvailable }`); see updateProduct's doc comment.
    const input = productPatchSchema.parse(body);
    const product = await updateProduct(session.shopId, id, input);
    return NextResponse.json(product);
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
    await deleteProduct(session.shopId, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
