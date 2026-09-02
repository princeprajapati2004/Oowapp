import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { printJobUpdateSchema } from "@/lib/validation/printer";
import { updatePrintJobStatus, getPrintJob } from "@/lib/services/print-job";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAdminSession();
    const { id } = await params;
    const job = await getPrintJob(session.shopId, id);
    return NextResponse.json(job);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAdminSession();
    const { id } = await params;
    const body = await request.json();
    const input = printJobUpdateSchema.parse(body);
    const job = await updatePrintJobStatus(session.shopId, id, input);
    return NextResponse.json(job);
  } catch (error) {
    return handleApiError(error);
  }
}
