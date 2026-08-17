import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { printJobCreateSchema } from "@/lib/validation/printer";
import { listPrintJobs, createPrintJob } from "@/lib/services/print-job";

export async function GET() {
  try {
    const session = await requireAdminSession();
    const jobs = await listPrintJobs(session.shopId);
    return NextResponse.json(jobs);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAdminSession();
    const body = await request.json();
    const input = printJobCreateSchema.parse(body);
    const job = await createPrintJob(session.shopId, input);
    return NextResponse.json(job, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
