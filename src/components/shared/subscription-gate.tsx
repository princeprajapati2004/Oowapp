"use client";

import { createContext, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Lock, CheckCircle2, Loader2 } from "lucide-react";
import { api, ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/utils/currency";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent } from "@/components/ui/dialog";

type BillingCycle = "MONTHLY" | "ANNUAL";
type GateStep = "closed" | "locked" | "plans" | "checkout" | "paying" | "success";

interface PurchasablePlan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  monthlyPrice: number | null;
  annualPrice: number | null;
  currency: string;
  isPopular: boolean;
  features: { key: string; label: string }[];
  terms: { id: string; content: string; version: number; accepted: boolean } | null;
}

function priceFor(plan: PurchasablePlan, cycle: BillingCycle) {
  return cycle === "ANNUAL" ? plan.annualPrice : plan.monthlyPrice;
}

// A module-level ref rather than only Context — api-client.ts (a plain
// function, not a component) needs to trigger this from anywhere a 403
// SUBSCRIPTION_EXPIRED response comes back, which can't consume a React
// Context. The Provider below registers itself here on mount; any other
// caller (including this file's own exported hook, if ever needed) calls
// through openSubscriptionGate().
let registeredOpen: (() => void) | null = null;

export function openSubscriptionGate() {
  registeredOpen?.();
}

export const SubscriptionGateContext = createContext<{ open: () => void } | null>(null);

/**
 * Global "locked feature -> buy a plan -> pay -> resume" overlay — mounted
 * once at the root layout so it can pop up over whatever admin page
 * triggered it, matching this app's read-always/write-gated model: the
 * underlying page never navigates away, so "return to the original
 * service" (closing this dialog) is automatic, not something that needs to
 * be explicitly tracked/replayed. See api-client.ts for the trigger.
 */
export function SubscriptionGateProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [step, setStep] = useState<GateStep>("closed");
  const [plans, setPlans] = useState<PurchasablePlan[] | null>(null);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("MONTHLY");
  const [selectedPlan, setSelectedPlan] = useState<PurchasablePlan | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(true);
  const [paying, setPaying] = useState(false);
  const scriptLoaded = useRef(false);
  // Mirrors `step` for open() below — a ref (not state) so open() always
  // sees the latest value without needing `step` in its own deps, which
  // would otherwise force registeredOpen to be re-registered on every step
  // change via the effect right below.
  const stepRef = useRef<GateStep>(step);
  stepRef.current = step;

  // Called from api-client.ts on EVERY 403 SUBSCRIPTION_EXPIRED response,
  // anywhere in the app — including ones unrelated to this dialog, which
  // can easily fire while the admin is already mid-checkout here (the
  // account is still expired for the whole duration of paying to fix
  // that). Resetting unconditionally would yank them back to the "locked"
  // screen and discard their selected plan/checkout progress; only the
  // first call (while actually closed) should open it.
  const open = useCallback(() => {
    if (stepRef.current !== "closed") return;
    setStep("locked");
    setPlans(null);
    setSelectedPlan(null);
  }, []);

  useEffect(() => {
    registeredOpen = open;
    return () => {
      registeredOpen = null;
    };
  }, [open]);

  function close() {
    setStep("closed");
  }

  useEffect(() => {
    if (step !== "success") return;
    const timer = setTimeout(() => {
      close();
      router.refresh();
    }, 1200);
    return () => clearTimeout(timer);
  }, [step, router]);

  async function loadPlans() {
    setStep("plans");
    try {
      const data = await api.get<PurchasablePlan[]>("/api/admin/subscription/purchasable-plans");
      setPlans(data);
    } catch {
      toast.error("Could not load subscription plans. Please try again.");
      setStep("locked");
    }
  }

  function selectPlan(plan: PurchasablePlan) {
    setSelectedPlan(plan);
    setTermsAccepted(plan.terms?.accepted ?? true);
    setStep("checkout");
  }

  async function loadRazorpayScript() {
    if (scriptLoaded.current || window.Razorpay) {
      scriptLoaded.current = true;
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Could not load the payment widget. Check your connection and try again."));
      document.body.appendChild(script);
    });
    scriptLoaded.current = true;
  }

  async function handlePay() {
    if (!selectedPlan) return;
    setPaying(true);
    try {
      if (selectedPlan.terms && !selectedPlan.terms.accepted && termsAccepted) {
        await api.post("/api/admin/subscription/terms/accept", { termsVersionId: selectedPlan.terms.id });
      }

      const order = await api.post<{
        transactionId: string;
        gatewayOrderId: string;
        razorpayKeyId: string;
        amount: number;
        currency: string;
      }>("/api/admin/subscription/checkout", { planId: selectedPlan.id, billingCycle });

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
        description: `${selectedPlan.name} — ${billingCycle === "ANNUAL" ? "Annual" : "Monthly"}`,
        handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          try {
            await api.post("/api/admin/subscription/checkout/verify", {
              transactionId: order.transactionId,
              gatewayOrderId: response.razorpay_order_id,
              gatewayPaymentId: response.razorpay_payment_id,
              gatewaySignature: response.razorpay_signature,
            });
            setStep("success");
          } catch (error) {
            toast.error(error instanceof ApiError ? error.message : "Payment verification failed");
            setStep("checkout");
          }
        },
        modal: {
          ondismiss: () => setStep("checkout"),
        },
      });
      razorpay.open();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not start checkout");
      setStep("checkout");
    } finally {
      setPaying(false);
    }
  }

  return (
    <SubscriptionGateContext.Provider value={{ open }}>
      {children}
      <Dialog open={step !== "closed"} onOpenChange={(next) => !next && close()}>
        <DialogContent className={step === "plans" ? "sm:max-w-3xl" : "sm:max-w-md"}>
          {step === "locked" && (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <div className="flex size-14 items-center justify-center rounded-full bg-muted">
                <Lock className="size-6 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold">Your Subscription Has Expired</h3>
              <p className="text-sm text-muted-foreground">
                Choose a subscription plan to continue using Oowapp services. Your existing data is safe and still viewable.
              </p>
              <Button onClick={loadPlans}>View Subscription Plans</Button>
            </div>
          )}

          {step === "plans" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-semibold">Choose a Plan</h3>
                <div className="inline-flex rounded-lg border p-0.5 text-sm">
                  {(["MONTHLY", "ANNUAL"] as BillingCycle[]).map((cycle) => (
                    <button
                      key={cycle}
                      onClick={() => setBillingCycle(cycle)}
                      className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                        billingCycle === cycle ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {cycle === "MONTHLY" ? "Monthly" : "Annual"}
                    </button>
                  ))}
                </div>
              </div>
              {!plans ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Loading plans…</p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-3">
                  {plans.map((plan) => {
                    const price = priceFor(plan, billingCycle);
                    return (
                      <Card key={plan.id} className={plan.isPopular ? "border-primary" : undefined}>
                        <CardHeader className="pb-2">
                          <div className="flex items-center gap-2">
                            <CardTitle className="text-base">{plan.name}</CardTitle>
                            {plan.isPopular && <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Popular</Badge>}
                          </div>
                          <CardDescription>
                            {price !== null ? (
                              <>
                                <span className="text-xl font-semibold text-foreground">{formatCurrency(price, plan.currency)}</span>
                                <span className="text-xs"> / {billingCycle === "ANNUAL" ? "year" : "month"}</span>
                              </>
                            ) : (
                              "Contact Sales"
                            )}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <ul className="space-y-1 text-xs text-muted-foreground">
                            {plan.features.slice(0, 5).map((f) => (
                              <li key={f.key}>• {f.label}</li>
                            ))}
                          </ul>
                          <Button className="w-full" size="sm" disabled={price === null} onClick={() => selectPlan(plan)}>
                            Select Plan
                          </Button>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {(step === "checkout" || step === "paying") && selectedPlan && (
            <div className="space-y-3">
              <h3 className="text-lg font-semibold">
                {selectedPlan.name} — {billingCycle === "ANNUAL" ? "Annual" : "Monthly"}
              </h3>
              <div className="rounded-lg border p-3 text-sm">
                <div className="flex justify-between">
                  <span>Payable amount</span>
                  <span className="font-medium">{formatCurrency(priceFor(selectedPlan, billingCycle) ?? 0, selectedPlan.currency)}</span>
                </div>
              </div>

              {selectedPlan.terms && !selectedPlan.terms.accepted && (
                <div className="space-y-2 rounded-lg border p-3">
                  <p className="text-xs font-medium text-muted-foreground">Terms &amp; Conditions</p>
                  <div className="max-h-28 overflow-y-auto whitespace-pre-wrap text-xs text-muted-foreground">
                    {selectedPlan.terms.content}
                  </div>
                  <label className="flex items-start gap-2 text-sm">
                    <Checkbox checked={termsAccepted} onCheckedChange={(checked) => setTermsAccepted(checked === true)} className="mt-0.5" />
                    <span>I have read and accept {selectedPlan.name}&apos;s terms and conditions.</span>
                  </label>
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" disabled={paying || step === "paying"} onClick={() => setStep("plans")}>
                  Back
                </Button>
                <Button className="flex-1" disabled={paying || step === "paying" || !termsAccepted} onClick={handlePay}>
                  {paying || step === "paying" ? <Loader2 className="size-4 animate-spin" /> : "Proceed to Pay"}
                </Button>
              </div>
            </div>
          )}

          {step === "success" && selectedPlan && (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CheckCircle2 className="size-12 text-emerald-600 dark:text-emerald-400" />
              <h3 className="text-lg font-semibold">Subscription Activated Successfully!</h3>
              <p className="text-sm text-muted-foreground">
                Your {selectedPlan.name} plan is now active. You can continue using Oowapp services.
              </p>
              <Button
                onClick={() => {
                  close();
                  router.refresh();
                }}
              >
                Continue to Oowapp
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </SubscriptionGateContext.Provider>
  );
}
