import { NextResponse } from "next/server";
import { requireAgentSession } from "@/lib/agent-auth";
import { handleApiError } from "@/lib/api-utils";
import { agentJobFailSchema } from "@/lib/validation/print-agent";
import { failPrintJob } from "@/lib/services/print-job";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAgentSession(request);
    const { id } = await params;
    const body = await request.json();
    const input = agentJobFailSchema.parse(body);
    const job = await failPrintJob(session.agentId, id, input.errorMessage);
    return NextResponse.json(job);
  } catch (error) {
    return handleApiError(error);
  }
}
