import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { setupAutoPay } from "@/lib/services/subscription-autopay";

const setupAutoPaySchema = z.object({
  planId: z.string().trim().min(1),
  billingCycle: z.enum(["MONTHLY", "ANNUAL"]),
});

export async function POST(request: Request) {
  try {
    const session = await requireAdminSession();
    const body = await request.json();
    const input = setupAutoPaySchema.parse(body);
    const result = await setupAutoPay(session.adminId, input);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
