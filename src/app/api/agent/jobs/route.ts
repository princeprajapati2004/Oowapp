import { NextResponse } from "next/server";
import { requireAgentSession } from "@/lib/agent-auth";
import { handleApiError } from "@/lib/api-utils";
import { listPendingJobsForAgent } from "@/lib/services/print-job";

/** Polling fallback for agents that can't hold the SSE stream open (or as a catch-up after a reconnect) — same PENDING jobs the stream would have pushed. */
export async function GET(request: Request) {
  try {
    const session = await requireAgentSession(request);
    const jobs = await listPendingJobsForAgent(session.agentId);
    return NextResponse.json(jobs);
  } catch (error) {
    return handleApiError(error);
  }
}
