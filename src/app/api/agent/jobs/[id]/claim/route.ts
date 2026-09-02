import { NextResponse } from "next/server";
import { requireAgentSession } from "@/lib/agent-auth";
import { handleApiError } from "@/lib/api-utils";
import { claimPrintJob } from "@/lib/services/print-job";

/** Atomic PENDING->PRINTING claim — the real duplicate-print guard. A second claim attempt for the same job (retry, race with SSE + poll) gets a 409, never a second successful claim. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAgentSession(_request);
    const { id } = await params;
    const job = await claimPrintJob(session.agentId, id);
    return NextResponse.json(job);
  } catch (error) {
    return handleApiError(error);
  }
}
