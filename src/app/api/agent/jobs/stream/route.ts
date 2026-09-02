import { requireAgentSession } from "@/lib/agent-auth";
import { createOrderEventStream } from "@/lib/server/order-events";
import { handleApiError } from "@/lib/api-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Long-lived push channel for the Local Print Agent — reuses the same SSE
 * plumbing as the admin/customer order streams, filtered down to this
 * agent's own print.job.* events only. The agent is a Node process (not a
 * browser EventSource), so unlike the customer-facing streams it can send a
 * real Authorization header.
 */
export async function GET(request: Request) {
  try {
    const session = await requireAgentSession(request);

    return createOrderEventStream(request, session.shopId, (event) => {
      if (event.type !== "print.job.created" && event.type !== "print.job.updated") return false;
      return event.job.agentId === session.agentId;
    });
  } catch (error) {
    return handleApiError(error);
  }
}
