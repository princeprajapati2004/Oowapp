import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const session = await requireAdminSession();
    const invoices = await db.subscriptionTransaction.findMany({
      where: { adminId: session.adminId, status: "SUCCESS" },
      orderBy: { paidAt: "desc" },
      include: { plan: { select: { name: true } }, coupon: { select: { code: true } } },
    });

    return NextResponse.json(
      invoices.map((t: (typeof invoices)[number]) => ({
        id: t.id,
        invoiceNumber: t.invoiceNumber,
        planName: t.plan.name,
        billingCycle: t.billingCycle,
        baseAmount: Number(t.baseAmount),
        discountAmount: Number(t.discountAmount),
        taxAmount: Number(t.taxAmount),
        totalAmount: Number(t.totalAmount),
        currency: t.currency,
        couponCode: t.coupon?.code ?? null,
        paidAt: t.paidAt,
      }))
    );
  } catch (error) {
    return handleApiError(error);
  }
}
