import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { taxSchema } from "@/lib/validation/tax";
import { listTaxes, createTax } from "@/lib/services/tax";

export async function GET() {
  try {
    const session = await requireAdminSession();
    const taxes = await listTaxes(session.shopId);
    return NextResponse.json(taxes);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAdminSession();
    const body = await request.json();
    const input = taxSchema.parse(body);
    const tax = await createTax(session.shopId, input);
    return NextResponse.json(tax, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
