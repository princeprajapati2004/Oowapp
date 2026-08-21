"use client";

// Client-side helper for MSG91 OTP — the fallback phone-verification provider
// used (by both the checkout PhoneVerification gate and the customer login
// form) when Firebase Phone Auth isn't configured. The actual send/verify
// calls go through this app's own API routes (send-msg91, verify-msg91,
// login-otp-msg91), which talk to MSG91 server-to-server — this file only
// holds the bits that are genuinely client-side: the "is MSG91 available"
// check and phone-number formatting.

export function isMsg91WidgetConfigured(): boolean {
  return !!process.env.NEXT_PUBLIC_MSG91_WIDGET_ID;
}

// MSG91 wants the mobile number as digits-only with country code, no "+" —
// same Indian-first assumption as firebase-otp-helpers.toE164, just without
// the leading plus.
export function toMsg91Identifier(raw: string): string {
  const digits = raw.trim().replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  return digits;
}
