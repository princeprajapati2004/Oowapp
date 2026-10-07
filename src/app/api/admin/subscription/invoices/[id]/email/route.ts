import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/session";
import { handleApiError, NotFoundError } from "@/lib/api-utils";
import { ForbiddenError } from "@/lib/session";
import { sendEmail } from "@/lib/services/email";
import { buildSubscriptionReceiptTemplate } from "@/lib/services/email-templates";
import { formatCurrency } from "@/lib/utils/currency";
import { db } from "@/lib/db";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdminSession();
    const { id } = await params;

    const [transaction, admin] = await Promise.all([
      db.subscriptionTransaction.findUnique({ where: { id }, include: { plan: { select: { name: true } } } }),
      db.admin.findUnique({ where: { id: session.adminId }, select: { email: true } }),
    ]);
    if (!transaction || transaction.status !== "SUCCESS" || !transaction.invoiceNumber) {
      throw new NotFoundError("Invoice not found");
    }
    if (transaction.adminId !== session.adminId) throw new ForbiddenError("This invoice does not belong to your account");
    if (!admin?.email) throw new NotFoundError("No email on file for this account");

    const template = buildSubscriptionReceiptTemplate({
      planName: transaction.plan.name,
      billingCycle: transaction.billingCycle,
      totalAmountFormatted: formatCurrency(Number(transaction.totalAmount), transaction.currency),
      invoiceNumber: transaction.invoiceNumber,
    });
    await sendEmail(admin.email, "Your OOWAPP subscription receipt", template.html, template.text);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
