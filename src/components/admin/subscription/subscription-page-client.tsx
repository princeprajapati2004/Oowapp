"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { api, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/utils/currency";
import { generateSubscriptionInvoicePdf } from "@/lib/utils/subscription-invoice-pdf";
import { Download, Mail } from "lucide-react";

type LimitKey = "BUSINESSES" | "USERS" | "PRODUCTS" | "GODOWNS" | "STORAGE_MB" | "MONTHLY_ORDERS" | "CUSTOMERS" | "INVOICES";
type BillingCycle = "MONTHLY" | "ANNUAL";

const LIMIT_LABELS: Record<LimitKey, string> = {
  BUSINESSES: "Businesses",
  USERS: "Users",
  PRODUCTS: "Products",
  GODOWNS: "Godowns",
  STORAGE_MB: "Storage",
  MONTHLY_ORDERS: "Orders this month",
  CUSTOMERS: "Customers",
  INVOICES: "Invoices",
};
const LIMIT_ORDER: LimitKey[] = ["PRODUCTS", "USERS", "BUSINESSES", "MONTHLY_ORDERS", "CUSTOMERS", "INVOICES", "STORAGE_MB", "GODOWNS"];

interface PlanClient {
  id: string;
  code: string;
  name: string;
  description: string | null;
  sortOrder: number;
  monthlyPrice: number | null;
  annualPrice: number | null;
  currency: string;
  isPopular: boolean;
  trialDays: number;
  features: { key: string; label: string }[];
  limits: { limitKey: LimitKey; limitValue: number | null }[];
}

interface CurrentClient {
  planCode: string;
  planName: string;
  resolvedPlanId: string | null;
  status: string;
  endDate: string | null;
  daysRemaining: number | null;
  cancelAtPeriodEnd: boolean;
}

type UsageSnapshot = Record<LimitKey, { used: number; limit: number | null }>;

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

function loadRazorpayScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load the payment widget. Check your connection and try again."));
    document.body.appendChild(script);
  });
}

function formatBytes(limitKey: LimitKey, value: number): string {
  if (limitKey !== "STORAGE_MB") return value.toLocaleString();
  if (value >= 1024) return `${(value / 1024).toFixed(1)} GB`;
  return `${value} MB`;
}

interface InvoiceClient {
  id: string;
  invoiceNumber: string;
  planName: string;
  billingCycle: BillingCycle;
  baseAmount: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  currency: string;
  couponCode: string | null;
  paidAt: string | null;
}

export function SubscriptionPageClient({
  current,
  usage,
  plans,
  invoices,
}: {
  current: CurrentClient;
  usage: UsageSnapshot;
  plans: PlanClient[];
  invoices: InvoiceClient[];
}) {
  const router = useRouter();
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("MONTHLY");
  const [checkoutPlan, setCheckoutPlan] = useState<PlanClient | null>(null);

  const currentPlanInList = plans.find((p) => p.id === current.resolvedPlanId) ?? null;

  return (
    <div className="max-w-5xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Subscription &amp; Billing</h1>
        <p className="text-sm text-muted-foreground">Manage your plan, usage, and billing.</p>
      </div>

      <CurrentPlanCard current={current} />

      <UsageOverview usage={usage} />

      <div>
        <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
          <h2 className="text-lg font-semibold">Plans</h2>
          <BillingToggle value={billingCycle} onChange={setBillingCycle} />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {plans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              billingCycle={billingCycle}
              isCurrent={plan.id === current.resolvedPlanId}
              currentPlanSortOrder={currentPlanInList?.sortOrder ?? -1}
              onUpgrade={() => setCheckoutPlan(plan)}
              onDowngrade={() => handleDowngrade(plan, billingCycle, router)}
            />
          ))}
        </div>
      </div>

      <InvoicesSection invoices={invoices} />

      {checkoutPlan && (
        <CheckoutDialog
          plan={checkoutPlan}
          billingCycle={billingCycle}
          onClose={() => setCheckoutPlan(null)}
          onSuccess={() => {
            setCheckoutPlan(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

async function handleDowngrade(plan: PlanClient, billingCycle: BillingCycle, router: ReturnType<typeof useRouter>) {
  try {
    const result = await api.post<{ applied: "immediate" | "scheduled"; blockers?: { limitKey: LimitKey; used: number; newLimit: number }[] }>(
      "/api/admin/subscription/downgrade",
      { planId: plan.id, billingCycle }
    );
    if (result.applied === "immediate") {
      toast.success(`Switched to ${plan.name}.`);
    } else {
      const blockerText = (result.blockers ?? [])
        .map((b) => `${LIMIT_LABELS[b.limitKey]} (${b.used} used, ${plan.name} allows ${b.newLimit})`)
        .join(", ");
      toast.message(`Downgrade to ${plan.name} scheduled for the end of your current billing period.`, {
        description: blockerText ? `Current usage exceeds: ${blockerText}.` : undefined,
      });
    }
    router.refresh();
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : "Failed to downgrade");
  }
}

function CurrentPlanCard({ current }: { current: CurrentClient }) {
  const [cancelling, setCancelling] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const router = useRouter();

  async function handleCancel() {
    setCancelling(true);
    try {
      await api.post("/api/admin/subscription/cancel", {});
      toast.success("Subscription will end at the close of your current billing period.");
      setConfirmOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to cancel");
    } finally {
      setCancelling(false);
    }
  }

  async function handleUndoCancel() {
    try {
      await api.delete("/api/admin/subscription/downgrade");
      toast.success("Cancellation undone — your plan will continue renewing.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to undo cancellation");
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base">Current Plan: {current.planName}</CardTitle>
          <StatusBadge status={current.status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Next billing</p>
            <p className="font-medium">{current.endDate ? new Date(current.endDate).toLocaleDateString() : "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Renewal</p>
            <p className="font-medium">{current.cancelAtPeriodEnd ? "Will not renew" : "Automatic"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Days remaining</p>
            <p className="font-medium">{current.daysRemaining ?? "—"}</p>
          </div>
        </div>

        {current.cancelAtPeriodEnd && (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-400">
            <span>Your plan is scheduled to downgrade at the end of this billing period.</span>
            <Button size="sm" variant="outline" onClick={handleUndoCancel}>Undo</Button>
          </div>
        )}

        {!current.cancelAtPeriodEnd && (
          <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <Button variant="outline" size="sm" onClick={() => setConfirmOpen(true)}>
              Cancel Subscription
            </Button>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Cancel subscription?</DialogTitle>
                <DialogDescription>
                  You&apos;ll keep full access until the end of your current billing period, then your
                  account moves to the free tier. No data is ever deleted.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="destructive" disabled={cancelling} onClick={handleCancel}>
                  {cancelling ? "Cancelling…" : "Confirm Cancellation"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    ACTIVE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    TRIAL: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    EXPIRING_SOON: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    EXPIRED: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    SUSPENDED: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    CANCELLED: "bg-muted text-muted-foreground",
  };
  return <Badge className={styles[status] ?? styles.CANCELLED}>{status.replace(/_/g, " ")}</Badge>;
}

function UsageOverview({ usage }: { usage: UsageSnapshot }) {
  return (
    <div>
      <h2 className="text-lg font-semibold mb-3">Usage Overview</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {LIMIT_ORDER.filter((key) => usage[key].limit !== null || usage[key].used > 0).map((key) => {
          const { used, limit } = usage[key];
          const pct = limit === null ? 0 : Math.min(100, Math.round((used / limit) * 100));
          const color = limit === null ? "bg-primary" : pct >= 100 ? "bg-red-500" : pct >= 90 ? "bg-red-400" : pct >= 80 ? "bg-amber-400" : "bg-primary";
          return (
            <Card key={key}>
              <CardContent className="py-3 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{LIMIT_LABELS[key]}</span>
                  <span className="text-muted-foreground">
                    {formatBytes(key, used)} / {limit === null ? "Unlimited" : formatBytes(key, limit)}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className={`h-full rounded-full ${color}`} style={{ width: limit === null ? "100%" : `${pct}%` }} />
                </div>
                {limit !== null && pct >= 80 && (
                  <p className={`text-xs flex items-center gap-1 ${pct >= 100 ? "text-red-600" : "text-amber-600"}`}>
                    <AlertTriangle className="size-3" />
                    {pct >= 100 ? "Limit reached — upgrade to add more." : pct >= 90 ? "Critical — almost at your limit." : "Approaching your limit."}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function BillingToggle({ value, onChange }: { value: BillingCycle; onChange: (v: BillingCycle) => void }) {
  return (
    <div className="inline-flex rounded-lg border p-0.5 text-sm">
      {(["MONTHLY", "ANNUAL"] as BillingCycle[]).map((cycle) => (
        <button
          key={cycle}
          onClick={() => onChange(cycle)}
          className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
            value === cycle ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {cycle === "MONTHLY" ? "Monthly" : "Annual"}
        </button>
      ))}
    </div>
  );
}

function PlanCard({
  plan,
  billingCycle,
  isCurrent,
  currentPlanSortOrder,
  onUpgrade,
  onDowngrade,
}: {
  plan: PlanClient;
  billingCycle: BillingCycle;
  isCurrent: boolean;
  currentPlanSortOrder: number;
  onUpgrade: () => void;
  onDowngrade: () => void;
}) {
  const price = billingCycle === "ANNUAL" ? plan.annualPrice : plan.monthlyPrice;
  const monthlyEquivalent = billingCycle === "ANNUAL" && plan.annualPrice !== null ? plan.annualPrice / 12 : null;
  const annualSavings =
    billingCycle === "ANNUAL" && plan.annualPrice !== null && plan.monthlyPrice !== null
      ? plan.monthlyPrice * 12 - plan.annualPrice
      : null;
  const savingsPct = annualSavings !== null && plan.monthlyPrice ? Math.round((annualSavings / (plan.monthlyPrice * 12)) * 100) : null;

  const noSelfServicePrice = price === null;
  const action = isCurrent ? "current" : noSelfServicePrice ? "contact" : plan.sortOrder < currentPlanSortOrder ? "downgrade" : "upgrade";

  return (
    <Card className={plan.isPopular ? "border-primary shadow-sm" : undefined}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">{plan.name}</CardTitle>
          {plan.isPopular && <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Most Popular</Badge>}
        </div>
        {plan.description && <CardDescription>{plan.description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          {noSelfServicePrice ? (
            <p className="text-2xl font-bold">Custom</p>
          ) : (
            <>
              <p className="text-2xl font-bold">
                {formatCurrency(price!, plan.currency)}
                <span className="text-sm font-normal text-muted-foreground">/{billingCycle === "ANNUAL" ? "yr" : "mo"}</span>
              </p>
              {monthlyEquivalent !== null && (
                <p className="text-xs text-muted-foreground">{formatCurrency(monthlyEquivalent, plan.currency)}/mo equivalent</p>
              )}
              {annualSavings !== null && annualSavings > 0 && (
                <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  Save {formatCurrency(annualSavings, plan.currency)} ({savingsPct}%)
                </p>
              )}
            </>
          )}
        </div>

        <ul className="space-y-1 text-sm">
          {plan.features.slice(0, 6).map((f) => (
            <li key={f.key} className="flex items-center gap-2">
              <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              {f.label}
            </li>
          ))}
        </ul>

        <ActionButton action={action} plan={plan} onUpgrade={onUpgrade} onDowngrade={onDowngrade} />
      </CardContent>
    </Card>
  );
}

function ActionButton({
  action,
  plan,
  onUpgrade,
  onDowngrade,
}: {
  action: "current" | "contact" | "upgrade" | "downgrade";
  plan: PlanClient;
  onUpgrade: () => void;
  onDowngrade: () => void;
}) {
  if (action === "current") {
    return <Button className="w-full" variant="outline" disabled>Current Plan</Button>;
  }
  if (action === "contact") {
    return (
      <Button className="w-full" variant="outline" onClick={() => toast.message(`Contact your OOWAPP account manager to discuss ${plan.name} pricing.`)}>
        Contact Sales
      </Button>
    );
  }
  if (action === "downgrade") {
    return <Button className="w-full" variant="outline" onClick={onDowngrade}>Downgrade</Button>;
  }
  return <Button className="w-full" onClick={onUpgrade}>Upgrade</Button>;
}

function InvoicesSection({ invoices }: { invoices: InvoiceClient[] }) {
  const [emailingId, setEmailingId] = useState<string | null>(null);

  async function handleDownload(invoice: InvoiceClient) {
    await generateSubscriptionInvoicePdf({
      invoiceNumber: invoice.invoiceNumber,
      paidAt: invoice.paidAt ?? new Date().toISOString(),
      planName: invoice.planName,
      billingCycle: invoice.billingCycle,
      baseAmount: invoice.baseAmount,
      discountAmount: invoice.discountAmount,
      couponCode: invoice.couponCode,
      taxAmount: invoice.taxAmount,
      totalAmount: invoice.totalAmount,
      currency: invoice.currency,
    });
  }

  async function handleEmail(invoice: InvoiceClient) {
    setEmailingId(invoice.id);
    try {
      await api.post(`/api/admin/subscription/invoices/${invoice.id}/email`, {});
      toast.success("Invoice emailed.");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to email invoice");
    } finally {
      setEmailingId(null);
    }
  }

  if (invoices.length === 0) return null;

  return (
    <div>
      <h2 className="text-lg font-semibold mb-3">Invoices</h2>
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Invoice</th>
                  <th className="px-3 py-2 text-left">Plan</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                      {invoice.paidAt ? new Date(invoice.paidAt).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{invoice.invoiceNumber}</td>
                    <td className="px-3 py-2">{invoice.planName}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(invoice.totalAmount, invoice.currency)}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1 justify-end">
                        <Button variant="outline" size="icon-sm" title="Download PDF" onClick={() => handleDownload(invoice)}>
                          <Download className="size-3.5" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon-sm"
                          title="Email me a copy"
                          disabled={emailingId === invoice.id}
                          onClick={() => handleEmail(invoice)}
                        >
                          <Mail className="size-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

type CheckoutStep = "confirm" | "paying" | "success";

function CheckoutDialog({
  plan,
  billingCycle,
  onClose,
  onSuccess,
}: {
  plan: PlanClient;
  billingCycle: BillingCycle;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [step, setStep] = useState<CheckoutStep>("confirm");
  const [couponCode, setCouponCode] = useState("");
  const [couponApplied, setCouponApplied] = useState<{ code: string; discountAmount: number } | null>(null);
  const [checkingCoupon, setCheckingCoupon] = useState(false);
  const [paying, setPaying] = useState(false);

  const basePrice = (billingCycle === "ANNUAL" ? plan.annualPrice : plan.monthlyPrice) ?? 0;

  async function applyCoupon() {
    if (!couponCode.trim()) return;
    setCheckingCoupon(true);
    try {
      const result = await api.post<{ valid: boolean; code: string; discountAmount: number }>("/api/admin/subscription/coupon/validate", {
        code: couponCode.trim(),
        planId: plan.id,
        billingCycle,
      });
      setCouponApplied({ code: result.code, discountAmount: result.discountAmount });
      toast.success(`Coupon ${result.code} applied.`);
    } catch (error) {
      setCouponApplied(null);
      toast.error(error instanceof ApiError ? error.message : "Invalid coupon");
    } finally {
      setCheckingCoupon(false);
    }
  }

  async function handlePay() {
    setPaying(true);
    try {
      const order = await api.post<{
        transactionId: string;
        gatewayOrderId: string;
        razorpayKeyId: string;
        amount: number;
        currency: string;
      }>("/api/admin/subscription/checkout", {
        planId: plan.id,
        billingCycle,
        couponCode: couponApplied?.code,
      });

      if (!order.razorpayKeyId) {
        toast.error("Payments are not configured yet. Please contact support.");
        setPaying(false);
        return;
      }

      await loadRazorpayScript();
      setStep("paying");

      const razorpay = new window.Razorpay!({
        key: order.razorpayKeyId,
        amount: order.amount,
        currency: order.currency,
        order_id: order.gatewayOrderId,
        name: "OOWAPP",
        description: `${plan.name} — ${billingCycle === "ANNUAL" ? "Annual" : "Monthly"}`,
        handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          try {
            await api.post("/api/admin/subscription/checkout/verify", {
              transactionId: order.transactionId,
              gatewayOrderId: response.razorpay_order_id,
              gatewayPaymentId: response.razorpay_payment_id,
              gatewaySignature: response.razorpay_signature,
            });
            setStep("success");
            toast.success(`${plan.name} is now active.`);
          } catch (error) {
            toast.error(error instanceof ApiError ? error.message : "Payment verification failed");
            setStep("confirm");
          }
        },
        modal: {
          ondismiss: () => setStep("confirm"),
        },
      });
      razorpay.open();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not start checkout");
      setStep("confirm");
    } finally {
      setPaying(false);
    }
  }

  const discount = couponApplied?.discountAmount ?? 0;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {step === "success" ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <CheckCircle2 className="size-12 text-emerald-600 dark:text-emerald-400" />
            <h3 className="text-lg font-semibold">You&apos;re on {plan.name}!</h3>
            <p className="text-sm text-muted-foreground">Your new plan is active immediately.</p>
            <Button onClick={onSuccess}>Done</Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{plan.name} — {billingCycle === "ANNUAL" ? "Annual" : "Monthly"}</DialogTitle>
              <DialogDescription>Review your order before paying.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="flex gap-2">
                <Input placeholder="Coupon code" value={couponCode} onChange={(e) => setCouponCode(e.target.value)} disabled={!!couponApplied} />
                <Button variant="outline" disabled={checkingCoupon || !!couponApplied} onClick={applyCoupon}>
                  {checkingCoupon ? <Loader2 className="size-4 animate-spin" /> : "Apply"}
                </Button>
              </div>
              <div className="rounded-lg border p-3 text-sm space-y-1">
                <div className="flex justify-between"><span>{plan.name}</span><span>{formatCurrency(basePrice, plan.currency)}</span></div>
                {discount > 0 && (
                  <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                    <span>Discount ({couponApplied?.code})</span>
                    <span>-{formatCurrency(discount, plan.currency)}</span>
                  </div>
                )}
                <p className="text-xs text-muted-foreground pt-1">GST (if applicable) is calculated on the next step.</p>
              </div>
            </div>
            <DialogFooter>
              <Button disabled={paying || step === "paying"} onClick={handlePay}>
                {paying || step === "paying" ? "Opening payment…" : "Proceed to Pay"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
