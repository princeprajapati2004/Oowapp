import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCustomerSession } from "@/lib/customer-session";
import { handleApiError } from "@/lib/api-utils";
import { writeAuditLog, extractRequestMeta } from "@/lib/services/audit-log";
import { createReturnRequest, toCustomerReturnDetailPayload, RETURN_DETAIL_INCLUDE } from "@/lib/services/return-request";
import { RETURN_REASONS } from "@/lib/return-status";

const createReturnSchema = z
  .object({
    orderId: z.string(),
    items: z
      .array(z.object({ orderItemId: z.string(), quantity: z.number().int().positive() }))
      .min(1),
    reason: z.enum(RETURN_REASONS as [string, ...string[]]),
    reasonOtherText: z.string().trim().max(300).optional(),
    notes: z.string().trim().max(1000).optional(),
    evidencePhotoUrls: z.array(z.string().url()).max(6).optional(),
  })
  .refine((v) => v.reason !== "OTHER" || !!v.reasonOtherText?.trim(), {
    message: "Please describe the reason for return",
    path: ["reasonOtherText"],
  });

// Authoritative, cross-device return history for a logged-in customer.
export async function GET(request: Request) {
  const session = await getCustomerSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const orderId = searchParams.get("orderId");

  const returns = await db.returnRequest.findMany({
    where: {
      shopId: session.shopId,
      customerId: session.customerId,
      ...(orderId ? { orderId } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: RETURN_DETAIL_INCLUDE,
    take: 100,
  });

  return NextResponse.json({ returns: returns.map(toCustomerReturnDetailPayload) });
}

export async function POST(request: Request) {
  try {
    const session = await getCustomerSession();
    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = createReturnSchema.parse(body);

    const created = await createReturnRequest({
      orderId: parsed.orderId,
      shopId: session.shopId,
      requireCustomerId: session.customerId,
      items: parsed.items,
      reason: parsed.reason as Parameters<typeof createReturnRequest>[0]["reason"],
      reasonOtherText: parsed.reasonOtherText,
      notes: parsed.notes,
      evidencePhotoUrls: parsed.evidencePhotoUrls,
      initiatedByType: "customer",
      initiatedById: session.customerId,
      enforceReturnWindow: true,
    });

    const { ipAddress, userAgent, requestId } = extractRequestMeta(request);
    writeAuditLog({
      action: "RETURN_REQUESTED",
      actorType: "customer",
      actorId: session.customerId,
      targetType: "return_request",
      targetId: created.id,
      shopId: session.shopId,
      metadata: {
        orderId: created.orderId,
        billNumber: created.order.billNumber,
        items: created.items.map((i) => ({ productName: i.productName, quantity: i.quantity })),
        reason: created.reason,
        requestedRefundAmount: Number(created.requestedRefundAmount),
      },
      ipAddress,
      userAgent,
      requestId,
    });

    return NextResponse.json(toCustomerReturnDetailPayload(created), { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
