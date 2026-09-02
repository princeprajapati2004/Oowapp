import { NextResponse } from "next/server";
import { requireAgentSession } from "@/lib/agent-auth";
import { handleApiError } from "@/lib/api-utils";
import { agentHeartbeatSchema } from "@/lib/validation/print-agent";
import { recordHeartbeat } from "@/lib/services/print-agent";

export async function POST(request: Request) {
  try {
    const session = await requireAgentSession(request);
    const body = await request.json().catch(() => ({}));
    const input = agentHeartbeatSchema.parse(body);
    const agent = await recordHeartbeat(session.agentId, input.version);
    return NextResponse.json({ ok: true, status: agent.status, lastSeenAt: agent.lastSeenAt });
  } catch (error) {
    return handleApiError(error);
  }
}
