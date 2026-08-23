"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Mail, RotateCcw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const RESEND_COOLDOWN = 30;

function VerifyEmailForm() {
  const router = useRouter();
  const params = useSearchParams();
  const email = params.get("email") ?? "";

  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN);
  const [resending, setResending] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Countdown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  function handleOtpChange(index: number, value: string) {
    if (!/^\d*$/.test(value)) return;
    const digit = value.slice(-1);
    const next = [...otp];
    next[index] = digit;
    setOtp(next);
    setError("");

    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all 6 digits are filled
    if (digit && index === 5) {
      const fullOtp = [...next].join("");
      if (fullOtp.length === 6) {
        void submitOtp(fullOtp);
      }
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (text.length === 6) {
      e.preventDefault();
      setOtp(text.split(""));
      void submitOtp(text);
    }
  }

  const submitOtp = useCallback(
    async (code: string) => {
      if (!email) return;
      setLoading(true);
      setError("");
      try {
        const res = await api.post<{ shopSlug?: string; pendingBusinessDetails?: boolean }>(
          "/api/auth/verify-email",
          { email, otp: code }
        );
        toast.success("Email verified!");
        if (res.pendingBusinessDetails) {
          router.push("/admin/signup/business-details");
        } else {
          router.push(`/admin`);
          router.refresh();
        }
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : "Verification failed. Please try again.";
        setError(msg);
        setOtp(["", "", "", "", "", ""]);
        inputRefs.current[0]?.focus();
      } finally {
        setLoading(false);
      }
    },
    [email, router]
  );

  async function handleResend() {
    if (cooldown > 0 || !email) return;
    setResending(true);
    try {
      await api.post("/api/auth/resend-otp", { email, purpose: "SIGNUP" });
      toast.success("New verification code sent!");
      setCooldown(RESEND_COOLDOWN);
      setOtp(["", "", "", "", "", ""]);
      setError("");
      inputRefs.current[0]?.focus();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not resend code");
    } finally {
      setResending(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const code = otp.join("");
    if (code.length !== 6) {
      setError("Please enter all 6 digits.");
      return;
    }
    await submitOtp(code);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4 py-10">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3">
          <Image
            src="/logo_1.webp"
            alt="OOWAPP"
            width={64}
            height={64}
            className="rounded-2xl ring-4 ring-background shadow-md"
            priority
          />
          <div className="space-y-0.5 text-center">
            <h1 className="text-xl font-bold tracking-tight">OOWAPP</h1>
            <p className="text-sm text-muted-foreground">Order on WhatsApp</p>
          </div>
        </div>

        <div className="rounded-2xl border bg-card shadow-md p-6 space-y-5">
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="size-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Mail className="size-5 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-semibold tracking-tight">Verify your email</h2>
              <p className="text-sm text-muted-foreground mt-1">
                We sent a 6-digit code to
                <br />
                <span className="font-medium text-foreground">{email || "your email"}</span>
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex gap-2 justify-center" onPaste={handlePaste}>
              {otp.map((digit, i) => (
                <Input
                  key={i}
                  ref={(el) => { inputRefs.current[i] = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleOtpChange(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  disabled={loading}
                  className={cn(
                    "w-11 h-12 text-center text-lg font-bold p-0 tabular-nums",
                    error && "border-destructive focus-visible:ring-destructive"
                  )}
                />
              ))}
            </div>

            {error && (
              <p className="text-sm text-destructive text-center">{error}</p>
            )}

            <Button
              type="submit"
              className="w-full h-10"
              disabled={loading || otp.join("").length !== 6}
            >
              {loading ? (
                <>
                  <ShieldCheck className="size-4 mr-2 animate-pulse" />
                  Verifying…
                </>
              ) : (
                "Verify & continue"
              )}
            </Button>
          </form>

          <div className="text-center">
            <button
              type="button"
              onClick={handleResend}
              disabled={cooldown > 0 || resending || !email}
              className={cn(
                "inline-flex items-center gap-1.5 text-sm transition-colors",
                cooldown > 0
                  ? "text-muted-foreground cursor-default"
                  : "text-primary hover:text-primary/80 font-medium"
              )}
            >
              <RotateCcw className={cn("size-3.5", resending && "animate-spin")} />
              {cooldown > 0 ? `Resend code in ${cooldown}s` : resending ? "Sending…" : "Resend code"}
            </button>
          </div>

          <p className="text-center text-xs text-muted-foreground">
            Wrong email?{" "}
            <Link href="/admin/signup" className="text-primary hover:text-primary/80 font-medium">
              Go back
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailForm />
    </Suspense>
  );
}
