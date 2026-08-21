"use client";

import { useEffect, useRef, useState } from "react";
import { RecaptchaVerifier, signInWithPhoneNumber, type ConfirmationResult } from "firebase/auth";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormRow } from "@/components/shared/form-row";
import { api, ApiError } from "@/lib/api-client";
import { getFirebaseAuth } from "@/lib/firebase-client";
import { toE164, firebaseErrorMessage } from "@/lib/firebase-otp-helpers";
import { isMsg91WidgetConfigured } from "@/lib/msg91-client";

type Stage = "enter" | "sent";
type OtpProvider = "firebase" | "msg91" | "db";

export function PhoneVerification({
  shopSlug,
  phone,
  onPhoneChange,
  verified,
  onVerifiedChange,
  error,
}: {
  shopSlug: string;
  phone: string;
  onPhoneChange: (phone: string) => void;
  verified: boolean;
  onVerifiedChange: (verified: boolean) => void;
  error?: string;
}) {
  const [stage, setStage] = useState<Stage>("enter");
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const verifiedForPhone = useRef<string | null>(verified ? phone : null);
  const recaptchaContainerRef = useRef<HTMLDivElement | null>(null);
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);
  const confirmationResultRef = useRef<ConfirmationResult | null>(null);
  // Signed {reqId, phone, shopId} token from send-msg91 — the msg91
  // counterpart to confirmationResultRef, held between send and verify.
  const msg91TokenRef = useRef<string | null>(null);
  // MSG91-only by explicit decision — Firebase Phone Auth requires the
  // provider to be enabled in the Firebase console (a setting nobody has
  // access to fix here), so it's deliberately excluded from the chain
  // rather than left as an unreliable first attempt. The "firebase" branches
  // in sendViaProvider/verifyCode below are dead code while this is empty —
  // left in place (not deleted) so Firebase can be re-enabled later just by
  // adding "firebase" back to this list, without redoing the integration.
  // The DB-backed dev-log fallback never delivers a real SMS, so it's only
  // ever used when nothing else is configured at all.
  const providerChain: OtpProvider[] = [];
  if (isMsg91WidgetConfigured()) providerChain.push("msg91");
  if (providerChain.length === 0) providerChain.push("db");
  const [activeProviderIndex, setActiveProviderIndex] = useState(0);
  const provider: OtpProvider = providerChain[activeProviderIndex] ?? providerChain[0];

  // A verified phone stops being "verified" the moment the customer edits it
  // to a different number — each number needs its own OTP round.
  useEffect(() => {
    if (verified && verifiedForPhone.current !== phone) {
      onVerifiedChange(false);
      setStage("enter");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  // Tear down the reCAPTCHA widget on unmount so it doesn't leak between
  // mounts (e.g. navigating away mid-verification).
  useEffect(() => {
    return () => {
      recaptchaVerifierRef.current?.clear();
      recaptchaVerifierRef.current = null;
    };
  }, []);

  async function sendViaProvider(p: OtpProvider): Promise<{ cooldownSeconds: number }> {
    if (p === "firebase") {
      const auth = getFirebaseAuth();
      if (!recaptchaVerifierRef.current) {
        recaptchaVerifierRef.current = new RecaptchaVerifier(auth, recaptchaContainerRef.current!, { size: "invisible" });
      }
      const result = await signInWithPhoneNumber(auth, toE164(phone), recaptchaVerifierRef.current);
      confirmationResultRef.current = result;
      return { cooldownSeconds: 30 };
    }
    if (p === "msg91") {
      const res = await api.post<{ ok: boolean; token: string }>("/api/customer/otp/send-msg91", {
        shopSlug,
        phone,
      });
      msg91TokenRef.current = res.token;
      return { cooldownSeconds: 30 };
    }
    const res = await api.post<{ ok: boolean; expiresInSeconds: number; resendCooldownSeconds: number }>(
      "/api/customer/otp/send",
      { shopSlug, phone }
    );
    return { cooldownSeconds: res.resendCooldownSeconds };
  }

  async function sendCode() {
    setOtpError(null);
    setSending(true);
    let lastErr: unknown = null;
    // Always start from the top of the chain — a failed Firebase send here
    // is a persistent config issue, not a transient one, but still the
    // architecturally "correct" provider to prefer if it starts working.
    for (let i = 0; i < providerChain.length; i++) {
      const candidate = providerChain[i];
      try {
        const { cooldownSeconds } = await sendViaProvider(candidate);
        setActiveProviderIndex(i);
        setStage("sent");
        setCooldown(cooldownSeconds);
        setCode("");
        setSending(false);
        return;
      } catch (err) {
        lastErr = err;
        if (candidate === "firebase") {
          // A failed send may leave the reCAPTCHA widget in a stale/used
          // state — clear it so a retry (this loop, or a later click) gets
          // a fresh challenge.
          recaptchaVerifierRef.current?.clear();
          recaptchaVerifierRef.current = null;
        }
      }
    }
    setOtpError(
      firebaseErrorMessage(lastErr) ?? (lastErr instanceof ApiError ? lastErr.message : "Couldn't send code — try again.")
    );
    setSending(false);
  }

  async function verifyCode() {
    setOtpError(null);
    setVerifying(true);
    try {
      if (provider === "firebase") {
        if (!confirmationResultRef.current) throw new Error("Please request a new code.");
        const credential = await confirmationResultRef.current.confirm(code);
        const idToken = await credential.user.getIdToken();
        // One-shot phone verification, not a parallel login — sign out of
        // Firebase immediately so only this app's own session cookie persists.
        await getFirebaseAuth().signOut();
        await api.post("/api/customer/otp/verify-firebase", { shopSlug, idToken });
      } else if (provider === "msg91") {
        if (!msg91TokenRef.current) throw new Error("Please request a new code.");
        await api.post("/api/customer/otp/verify-msg91", { shopSlug, token: msg91TokenRef.current, otp: code });
      } else {
        await api.post("/api/customer/otp/verify", { shopSlug, phone, code });
      }
      verifiedForPhone.current = phone;
      onVerifiedChange(true);
    } catch (err) {
      setOtpError(
        firebaseErrorMessage(err) ?? (err instanceof ApiError ? err.message : "Verification failed — try again.")
      );
    } finally {
      setVerifying(false);
    }
  }

  if (verified) {
    return (
      <FormRow label="Phone number" htmlFor="customerPhone" required>
        <div className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm animate-in fade-in zoom-in-95 duration-200 dark:border-emerald-800 dark:bg-emerald-900/20">
          <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span className="font-semibold">{phone}</span>
          <span className="text-xs text-emerald-700 dark:text-emerald-400">Verified</span>
          <button
            type="button"
            className="ml-auto text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            onClick={() => {
              onVerifiedChange(false);
              verifiedForPhone.current = null;
              setStage("enter");
            }}
          >
            Change
          </button>
        </div>
      </FormRow>
    );
  }

  return (
    <div className="space-y-2">
      {/* Invisible reCAPTCHA anchor for Firebase Phone Auth — no visible UI, just needs
          to stay mounted whenever Firebase is a candidate in the chain (not just when
          it's the currently-active provider), since every send/resend retries it first. */}
      {providerChain.includes("firebase") && <div ref={recaptchaContainerRef} />}
      <FormRow
        label="Phone number"
        htmlFor="customerPhone"
        required
        error={error ? { message: error } : undefined}
      >
        <div className="flex gap-2">
          <Input
            id="customerPhone"
            inputMode="numeric"
            placeholder="Your phone number"
            value={phone}
            onChange={(e) => onPhoneChange(e.target.value)}
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
          <FormRow label="Enter 6-digit code" htmlFor="otpCode">
            <Input
              id="otpCode"
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
            className="h-10 w-full"
            disabled={verifying || code.length !== 6}
            onClick={verifyCode}
          >
            {verifying ? (
              <>
                <Loader2 className="mr-1.5 size-4 animate-spin" /> Verifying…
              </>
            ) : (
              "Verify OTP"
            )}
          </Button>
        </div>
      )}

      {otpError && <p className="text-sm text-destructive">{otpError}</p>}
    </div>
  );
}
