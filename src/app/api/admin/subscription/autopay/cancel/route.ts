import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { cancelAutoPay } from "@/lib/services/subscription-autopay";
import { writeAuditLog, extractRequestMeta } from "@/lib/services/audit-log";

const cancelAutoPaySchema = z.object({
  mandateId: z.string().trim().min(1),
});

export async function POST(request: Request) {
  try {
    const session = await requireAdminSession();
    const body = await request.json();
    const input = cancelAutoPaySchema.parse(body);
    const mandate = await cancelAutoPay(session.adminId, input.mandateId);

    const { ipAddress, userAgent, requestId } = extractRequestMeta(request);
    await writeAuditLog({
      action: "SUBSCRIPTION_CHANGED",
      actorType: "admin",
      actorId: session.adminId,
      targetType: "subscription",
      targetId: mandate.id,
      metadata: { autoPayCancelled: true, razorpaySubscriptionId: mandate.razorpaySubscriptionId },
      ipAddress,
      userAgent,
      requestId,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
