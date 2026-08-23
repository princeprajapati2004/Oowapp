"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormRow } from "@/components/shared/form-row";
import { InstallApp } from "@/components/shared/install-app";

const RESEND_COOLDOWN = 30;

export function LoginForm() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function sendOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSending(true);
    setError("");
    try {
      await api.post("/api/auth/send-login-otp", { email: email.trim() });
      setStep("otp");
      setCooldown(RESEND_COOLDOWN);
      toast.success("If that account exists, a code has been sent.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not send the code");
    } finally {
      setSending(false);
    }
  }

  async function resend() {
    if (cooldown > 0) return;
    setSending(true);
    try {
      await api.post("/api/auth/send-login-otp", { email: email.trim() });
      setCooldown(RESEND_COOLDOWN);
      toast.success("Code resent");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not resend the code");
    } finally {
      setSending(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (otp.length !== 6) return;
    setVerifying(true);
    setError("");
    try {
      await api.post("/api/auth/verify-login-otp", { email: email.trim(), otp });
      router.push("/admin");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Verification failed");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4 py-10">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3">
          <Image
            src="/logo_1.webp"
            alt="OOWAPP"
            width={72}
            height={72}
            className="rounded-2xl shadow-md ring-4 ring-background"
            priority
          />
          <div className="space-y-0.5 text-center">
            <h1 className="text-xl font-bold tracking-tight">OOWAPP</h1>
            <p className="text-sm text-muted-foreground">Order on WhatsApp</p>
          </div>
          <InstallApp alwaysShow />
        </div>

        <div className="rounded-2xl border bg-card shadow-md p-6 space-y-5">
          <div className="space-y-1">
            <h2 className="text-base font-semibold tracking-tight">Welcome back</h2>
            <p className="text-sm text-muted-foreground">
              {step === "email" ? "Sign in with a one-time code — no password needed." : `We sent a code to ${email}`}
            </p>
          </div>

          {step === "email" ? (
            <form onSubmit={sendOtp} className="space-y-3">
              <FormRow label="Email" htmlFor="email" required>
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </FormRow>
              <Button type="submit" className="h-10 w-full" disabled={sending}>
                {sending ? "Sending…" : "Send code"}
              </Button>
            </form>
          ) : (
            <form onSubmit={verify} className="space-y-3">
              <FormRow
                label="Enter the 6-digit code"
                htmlFor="otp"
                required
                error={error ? { message: error } : undefined}
              >
                <Input
                  id="otp"
                  inputMode="numeric"
                  maxLength={6}
                  autoFocus
                  value={otp}
                  onChange={(e) => {
                    setOtp(e.target.value.replace(/\D/g, "").slice(0, 6));
                    setError("");
                  }}
                  placeholder="123456"
                />
              </FormRow>
              <Button type="submit" className="h-10 w-full" disabled={verifying || otp.length !== 6}>
                {verifying ? "Verifying…" : "Sign in"}
              </Button>
              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => {
                    setStep("email");
                    setOtp("");
                    setError("");
                  }}
                >
                  Use a different email
                </button>
                <button
                  type="button"
                  className="font-medium text-primary hover:text-primary/80 transition-colors disabled:opacity-50 disabled:pointer-events-none"
                  disabled={cooldown > 0 || sending}
                  onClick={resend}
                >
                  {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
                </button>
              </div>
            </form>
          )}

          {step === "email" && (
            <p className="text-center text-sm text-muted-foreground">
              New here?{" "}
              <Link
                href="/admin/signup"
                className="font-medium text-primary hover:text-primary/80 underline underline-offset-4 transition-colors"
              >
                Set up your shop
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
