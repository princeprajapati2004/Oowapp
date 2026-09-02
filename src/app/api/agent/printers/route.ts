import { NextResponse } from "next/server";
import { requireAgentSession } from "@/lib/agent-auth";
import { handleApiError } from "@/lib/api-utils";
import { agentPrinterReportSchema } from "@/lib/validation/print-agent";
import { reportDiscoveredPrinters } from "@/lib/services/print-agent";

export async function POST(request: Request) {
  try {
    const session = await requireAgentSession(request);
    const body = await request.json();
    const input = agentPrinterReportSchema.parse(body);
    const printers = await reportDiscoveredPrinters(session.agentId, session.shopId, input);
    return NextResponse.json(printers);
  } catch (error) {
    return handleApiError(error);
  }
}
