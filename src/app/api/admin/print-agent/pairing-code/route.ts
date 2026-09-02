import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { createPairingCode } from "@/lib/services/print-agent";

export async function POST() {
  try {
    const session = await requireAdminSession();
    if (!checkRateLimit(`print-agent-pairing:${session.shopId}`, 10, 10 * 60_000)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }
    const { code, expiresAt } = await createPairingCode(session.shopId);
    return NextResponse.json({ code, expiresAt }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
