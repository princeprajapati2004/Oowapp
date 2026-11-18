import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { recordTermsAcceptance } from "@/lib/services/subscription-terms";

const acceptTermsSchema = z.object({
  termsVersionId: z.string().trim().min(1),
});

export async function POST(request: Request) {
  try {
    const session = await requireAdminSession();
    const body = await request.json();
    const input = acceptTermsSchema.parse(body);
    await recordTermsAcceptance(session.adminId, input.termsVersionId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
