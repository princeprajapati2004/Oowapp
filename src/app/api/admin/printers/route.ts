import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { printerSchema } from "@/lib/validation/printer";
import { listPrinters, createPrinter } from "@/lib/services/printer";

export async function GET() {
  try {
    const session = await requireAdminSession();
    const printers = await listPrinters(session.shopId);
    return NextResponse.json(printers);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAdminSession();
    const body = await request.json();
    const input = printerSchema.parse(body);
    const printer = await createPrinter(session.shopId, input);
    return NextResponse.json(printer, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
