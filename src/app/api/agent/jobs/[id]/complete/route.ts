import { NextResponse } from "next/server";
import { requireAgentSession } from "@/lib/agent-auth";
import { handleApiError } from "@/lib/api-utils";
import { completePrintJob } from "@/lib/services/print-job";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAgentSession(request);
    const { id } = await params;
    const job = await completePrintJob(session.agentId, id);
    return NextResponse.json(job);
  } catch (error) {
    return handleApiError(error);
  }
}
