import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { agentRegisterSchema } from "@/lib/validation/print-agent";
import { registerAgent } from "@/lib/services/print-agent";

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (!checkRateLimit(`agent-register:${ip}`, 10, 60_000)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const body = await request.json();
    const input = agentRegisterSchema.parse(body);
    const { agent, token } = await registerAgent(input);

    return NextResponse.json(
      { agentId: agent.id, shopId: agent.shopId, token },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
