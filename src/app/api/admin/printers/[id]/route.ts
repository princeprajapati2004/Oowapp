import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { printerUpdateSchema } from "@/lib/validation/printer";
import { updatePrinter, deletePrinter } from "@/lib/services/printer";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAdminSession();
    const { id } = await params;
    const body = await request.json();
    const input = printerUpdateSchema.parse(body);
    const printer = await updatePrinter(session.shopId, id, input);
    return NextResponse.json(printer);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAdminSession();
    const { id } = await params;
    await deletePrinter(session.shopId, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
