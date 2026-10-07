import { listSubscriptionCoupons } from "@/lib/services/subscription-coupon";
import { listSubscriptionTransactions } from "@/lib/services/subscription-transaction-admin";
import { getSubscriptionTaxConfig } from "@/lib/services/subscription-tax";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CouponManager } from "@/components/super-admin/coupon-manager";
import { TaxSettingsForm } from "@/components/super-admin/tax-settings-form";
import { TransactionsTable } from "@/components/super-admin/transactions-table";

export default async function BillingPage() {
  const [coupons, transactions, taxConfig] = await Promise.all([
    listSubscriptionCoupons(),
    listSubscriptionTransactions({ page: 1 }),
    getSubscriptionTaxConfig(),
  ]);

  const couponsForClient = coupons.map((c: (typeof coupons)[number]) => ({
    ...c,
    discountValue: Number(c.discountValue),
    maxDiscountAmount: c.maxDiscountAmount !== null ? Number(c.maxDiscountAmount) : null,
    minAmount: c.minAmount !== null ? Number(c.minAmount) : null,
    startsAt: c.startsAt ? c.startsAt.toISOString() : null,
    expiresAt: c.expiresAt ? c.expiresAt.toISOString() : null,
  }));

  const transactionsForClient = transactions.rows.map((t: (typeof transactions.rows)[number]) => ({
    id: t.id,
    ownerEmail: t.admin.email,
    planName: t.plan.name,
    billingCycle: t.billingCycle,
    baseAmount: Number(t.baseAmount),
    discountAmount: Number(t.discountAmount),
    taxAmount: Number(t.taxAmount),
    totalAmount: Number(t.totalAmount),
    currency: t.currency,
    status: t.status,
    couponCode: t.coupon?.code ?? null,
    invoiceNumber: t.invoiceNumber,
    paidAt: t.paidAt ? t.paidAt.toISOString() : null,
    createdAt: t.createdAt.toISOString(),
  }));

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Coupons &amp; Billing</h1>
        <p className="text-sm text-muted-foreground">
          Subscription discount codes, payment history, and GST configuration for OOWAPP&apos;s
          own billing — unrelated to shop-customer coupons.
        </p>
      </div>

      <Tabs defaultValue="coupons">
        <TabsList>
          <TabsTrigger value="coupons">Coupons</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="tax">Tax Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="coupons" className="pt-4">
          <CouponManager coupons={couponsForClient} />
        </TabsContent>
        <TabsContent value="transactions" className="pt-4">
          <TransactionsTable transactions={transactionsForClient} total={transactions.total} />
        </TabsContent>
        <TabsContent value="tax" className="pt-4">
          <TaxSettingsForm initial={taxConfig} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
