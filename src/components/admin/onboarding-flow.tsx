"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { CheckCircle2, Circle, Phone, ShieldCheck } from "lucide-react";
import { onboardingProfileSchema, type OnboardingProfileInput } from "@/lib/validation/onboarding";
import { CURRENCIES } from "@/lib/currencies";
import { api, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FieldGroup } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormRow } from "@/components/shared/form-row";

type Step = "phone" | "profile" | "complete";

function StepBadge({ label, state }: { label: string; state: "done" | "current" | "upcoming" }) {
  return (
    <div className="flex items-center gap-2">
      {state === "done" ? (
        <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
      ) : (
        <Circle className={"size-4 shrink-0 " + (state === "current" ? "text-primary" : "text-muted-foreground/40")} />
      )}
      <span className={"text-sm " + (state === "upcoming" ? "text-muted-foreground" : "font-medium")}>{label}</span>
    </div>
  );
}

function PhoneVerificationStep({
  whatsappNumber,
  onVerified,
}: {
  whatsappNumber: string;
  onVerified: () => void;
}) {
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [otp, setOtp] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function sendOtp() {
    setSending(true);
    setError("");
    try {
      const res = await api.post<{ resendCooldownSeconds: number }>("/api/admin/onboarding/send-phone-otp", {});
      setSent(true);
      setCooldown(res.resendCooldownSeconds);
      toast.success(`Code sent to ${whatsappNumber}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not send the code");
    } finally {
      setSending(false);
    }
  }

  async function verify() {
    if (otp.length !== 6) return;
    setVerifying(true);
    setError("");
    try {
      await api.post("/api/admin/onboarding/verify-phone-otp", { otp });
      toast.success("Mobile number verified");
      onVerified();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Verification failed");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary shrink-0">
          <Phone className="size-5" />
        </div>
        <div>
          <h2 className="font-semibold">Verify your mobile number</h2>
          <p className="text-sm text-muted-foreground">
            We&apos;ll send a 6-digit code to <span className="font-medium text-foreground">{whatsappNumber}</span>.
          </p>
        </div>
      </div>

      {!sent ? (
        <Button onClick={sendOtp} disabled={sending} className="w-full">
          {sending ? "Sending…" : "Send OTP"}
        </Button>
      ) : (
        <div className="space-y-3">
          <FormRow
            label="Enter the 6-digit code"
            htmlFor="phone-otp"
            error={error ? { message: error } : undefined}
          >
            <Input
              id="phone-otp"
              inputMode="numeric"
              maxLength={6}
              value={otp}
              onChange={(e) => {
                setOtp(e.target.value.replace(/\D/g, "").slice(0, 6));
                setError("");
              }}
              placeholder="123456"
            />
          </FormRow>
          <Button onClick={verify} disabled={verifying || otp.length !== 6} className="w-full">
            {verifying ? "Verifying…" : "Verify"}
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            disabled={cooldown > 0 || sending}
            onClick={sendOtp}
          >
            {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
          </Button>
        </div>
      )}
    </div>
  );
}

function BusinessProfileStep({
  defaultValues,
  onSaved,
}: {
  defaultValues: OnboardingProfileInput;
  onSaved: () => void;
}) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<OnboardingProfileInput>({
    resolver: zodResolver(onboardingProfileSchema),
    defaultValues,
  });

  const currency = watch("currency");

  async function onSubmit(values: OnboardingProfileInput) {
    try {
      await api.post("/api/admin/onboarding", values);
      onSaved();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not save your business profile");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary shrink-0">
          <ShieldCheck className="size-5" />
        </div>
        <div>
          <h2 className="font-semibold">Tell us about your business</h2>
          <p className="text-sm text-muted-foreground">A few more details and you&apos;re ready to go.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
        <FormRow label="Owner name" htmlFor="ownerName" required error={errors.ownerName}>
          <Input id="ownerName" {...register("ownerName")} placeholder="Your full name" />
        </FormRow>

        <FormRow label="Business address" htmlFor="address" required error={errors.address}>
          <Textarea id="address" rows={2} {...register("address")} placeholder="Shop no., street, area" />
        </FormRow>

        <FieldGroup className="sm:grid sm:grid-cols-2 sm:gap-3 sm:space-y-0">
          <FormRow label="City" htmlFor="city" required error={errors.city}>
            <Input id="city" {...register("city")} />
          </FormRow>
          <FormRow label="State" htmlFor="state" required error={errors.state}>
            <Input id="state" {...register("state")} />
          </FormRow>
          <FormRow label="Pincode" htmlFor="pincode" required error={errors.pincode}>
            <Input id="pincode" inputMode="numeric" maxLength={6} {...register("pincode")} />
          </FormRow>
          <FormRow label="Country" htmlFor="country" error={errors.country}>
            <Input id="country" {...register("country")} />
          </FormRow>
          <FormRow label="GST number (optional)" htmlFor="gstNumber" error={errors.gstNumber}>
            <Input id="gstNumber" {...register("gstNumber")} />
          </FormRow>
          <FormRow label="Currency" htmlFor="currency">
            <Select value={currency} onValueChange={(v) => v && setValue("currency", v as OnboardingProfileInput["currency"])}>
              <SelectTrigger id="currency" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormRow>
        </FieldGroup>

        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? "Saving…" : "Complete setup"}
        </Button>
      </form>
    </div>
  );
}

function CompleteStep({ onGoToDashboard }: { onGoToDashboard: () => void }) {
  return (
    <div className="space-y-5 text-center">
      <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
        <CheckCircle2 className="size-7" />
      </div>
      <div>
        <h2 className="text-lg font-bold">Your business is ready!</h2>
        <p className="text-sm text-muted-foreground">Everything is set up — you&apos;re good to go.</p>
      </div>
      <div className="space-y-2 rounded-xl border bg-muted/30 p-4 text-left">
        <StepBadge label="Mobile verified" state="done" />
        <StepBadge label="Email verified" state="done" />
        <StepBadge label="Business created" state="done" />
        <StepBadge label="Business profile completed" state="done" />
      </div>
      <Button onClick={onGoToDashboard} className="w-full">
        Go to Dashboard
      </Button>
    </div>
  );
}

export function OnboardingFlow({
  phoneVerified,
  businessName,
  whatsappNumber,
  initialProfile,
}: {
  email: string;
  phoneVerified: boolean;
  businessName: string;
  whatsappNumber: string;
  shopSlug: string;
  initialProfile: OnboardingProfileInput;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(phoneVerified ? "profile" : "phone");

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4 py-10">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-xl font-bold tracking-tight">Welcome to OOWAPP</h1>
          <p className="text-sm text-muted-foreground">Let&apos;s finish setting up {businessName}</p>
        </div>

        <div className="rounded-2xl border bg-card shadow-md p-6">
          {step === "phone" && (
            <PhoneVerificationStep whatsappNumber={whatsappNumber} onVerified={() => setStep("profile")} />
          )}
          {step === "profile" && (
            <BusinessProfileStep defaultValues={initialProfile} onSaved={() => setStep("complete")} />
          )}
          {step === "complete" && <CompleteStep onGoToDashboard={() => router.push("/admin")} />}
        </div>
      </div>
    </div>
  );
}
