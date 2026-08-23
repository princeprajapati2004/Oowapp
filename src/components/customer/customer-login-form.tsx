"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { customerLoginSchema, type CustomerLoginInput } from "@/lib/validation/customer-auth";
import { api, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldGroup } from "@/components/ui/field";
import { FormRow } from "@/components/shared/form-row";
import { cn } from "@/lib/utils";

type LoginMethod = "password" | "otp";
type OtpStage = "enter" | "sent";

export function CustomerLoginForm({
  slug,
  businessName,
  logoUrl,
  otpAvailable,
}: {
  slug: string;
  businessName: string;
  logoUrl: string | null;
  // Computed server-side (SMS provider configured via Admin → SMS setup or
  // env vars) — this component never needs to know which provider it is.
  otpAvailable: boolean;
}) {
  const router = useRouter();
  const [method, setMethod] = useState<LoginMethod>("password");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Omit<CustomerLoginInput, "shopSlug">>({
    resolver: zodResolver(customerLoginSchema.omit({ shopSlug: true })),
  });

  async function onSubmit(values: Omit<CustomerLoginInput, "shopSlug">) {
    try {
      await api.post("/api/customer/auth/login", { ...values, shopSlug: slug });
      router.push(`/order/${slug}`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Login failed");
    }
  }

  function onOtpSuccess() {
    router.push(`/order/${slug}`);
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4 py-10">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3">
          {logoUrl ? (
            <Image
              src={logoUrl}
              alt={businessName}
              width={64}
              height={64}
              unoptimized
              className="rounded-2xl shadow-md ring-4 ring-background object-cover"
            />
          ) : null}
          <div className="space-y-0.5 text-center">
            <h1 className="text-xl font-bold tracking-tight">{businessName}</h1>
          </div>
        </div>

        <div className="rounded-2xl border bg-card shadow-md p-6 space-y-5">
          <div className="space-y-1">
            <h2 className="text-base font-semibold tracking-tight">Welcome back</h2>
            <p className="text-sm text-muted-foreground">Sign in to track and manage your orders.</p>
          </div>

          {otpAvailable && (
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1 text-sm">
              <button
                type="button"
                onClick={() => setMethod("password")}
                className={cn(
                  "rounded-lg py-1.5 font-medium transition-colors",
                  method === "password" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                Password
              </button>
              <button
                type="button"
                onClick={() => setMethod("otp")}
                className={cn(
                  "rounded-lg py-1.5 font-medium transition-colors",
                  method === "otp" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                OTP
              </button>
            </div>
          )}

          {method === "password" ? (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
              <FieldGroup>
                <FormRow label="Phone number" htmlFor="phone" required error={errors.phone}>
                  <Input
                    id="phone"
                    inputMode="numeric"
                    autoComplete="username"
                    placeholder="91XXXXXXXXXX"
                    {...register("phone")}
                  />
                </FormRow>
                <FormRow label="Password" htmlFor="password" required error={errors.password}>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    placeholder="••••••••"
                    {...register("password")}
                  />
                </FormRow>
              </FieldGroup>

              <Button
                type="submit"
                className="h-10 w-full bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm shadow-primary/20 transition-all"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Signing in…" : "Sign in"}
              </Button>
            </form>
          ) : (
            <OtpLoginBlock slug={slug} onSuccess={onOtpSuccess} />
          )}

          <p className="text-center text-sm text-muted-foreground">
            New here?{" "}
            <Link
              href={`/order/${slug}/signup`}
              className="font-medium text-primary hover:text-primary/80 underline underline-offset-4 transition-colors"
            >
              Create an account
            </Link>
          </p>
          <p className="text-center text-xs text-muted-foreground">
            <Link href={`/order/${slug}`} className="hover:text-foreground transition-colors">
              Continue as guest
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

// Self-contained OTP login flow (send code → verify → session cookie), same
// underlying engine as checkout's PhoneVerification (phone-otp.ts +
// sms-provider.ts) but finishing with a session login rather than a
// "verified" flag.
function OtpLoginBlock({ slug, onSuccess }: { slug: string; onSuccess: () => void }) {
  const [stage, setStage] = useState<OtpStage>("enter");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  async function sendCode() {
    setOtpError(null);
    setSending(true);
    try {
      const res = await api.post<{ ok: boolean; resendCooldownSeconds: number }>(
        "/api/customer/auth/send-login-otp",
        { shopSlug: slug, phone }
      );
      setStage("sent");
      setCooldown(res.resendCooldownSeconds);
      setCode("");
    } catch (err) {
      setOtpError(err instanceof ApiError ? err.message : "Couldn't send code — try again.");
    } finally {
      setSending(false);
    }
  }

  async function verifyCode() {
    setOtpError(null);
    setVerifying(true);
    try {
      await api.post("/api/customer/auth/login-otp", { shopSlug: slug, phone, code });
      onSuccess();
    } catch (err) {
      setOtpError(err instanceof ApiError ? err.message : "Verification failed — try again.");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="space-y-3">
      <FormRow label="Phone number" htmlFor="otpPhone" required>
        <div className="flex gap-2">
          <Input
            id="otpPhone"
            inputMode="numeric"
            placeholder="91XXXXXXXXXX"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={stage === "sent"}
            className="flex-1"
          />
          <Button
            type="button"
            variant="outline"
            className="shrink-0"
            disabled={sending || phone.trim().length < 8 || (stage === "sent" && cooldown > 0)}
            onClick={sendCode}
          >
            {sending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : stage === "sent" ? (
              cooldown > 0 ? `Resend (${cooldown}s)` : "Resend OTP"
            ) : (
              "Send OTP"
            )}
          </Button>
        </div>
      </FormRow>

      {stage === "sent" && (
        <div className="animate-in fade-in slide-in-from-top-1 duration-200 space-y-2 rounded-xl bg-muted/40 p-3">
          <FormRow label="Enter 6-digit code" htmlFor="otpLoginCode">
            <Input
              id="otpLoginCode"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="text-center font-mono text-lg tracking-[0.4em]"
            />
          </FormRow>
          <Button
            type="button"
            className="h-10 w-full bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm shadow-primary/20 transition-all"
            disabled={verifying || code.length !== 6}
            onClick={verifyCode}
          >
            {verifying ? (
              <>
                <Loader2 className="mr-1.5 size-4 animate-spin" /> Verifying…
              </>
            ) : (
              "Verify & sign in"
            )}
          </Button>
        </div>
      )}

      {otpError && <p className="text-sm text-destructive">{otpError}</p>}
    </div>
  );
}
