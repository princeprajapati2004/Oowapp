// Shared by every UI that does a Firebase Phone Auth OTP round (checkout's
// PhoneVerification gate and the customer login form) so the normalization
// and error-message rules stay in exactly one place.

// Indian-first normalization matching this app's existing phone convention
// (UPI/WhatsApp code elsewhere assumes a 91 country code) — Firebase requires
// full E.164 ("+91XXXXXXXXXX"), unlike the rest of the app's bare-digit format.
export function toE164(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("+")) return `+${trimmed.slice(1).replace(/\D/g, "")}`;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  return `+${digits}`;
}

const FIREBASE_ERROR_MESSAGES: Record<string, string> = {
  "auth/invalid-phone-number": "That phone number doesn't look valid — include the country code.",
  "auth/too-many-requests": "Too many attempts from this device — please try again later.",
  "auth/captcha-check-failed": "Verification check failed — please try again.",
  "auth/quota-exceeded": "SMS limit reached for this restaurant right now — please try again later.",
  "auth/code-expired": "That code expired — request a new one.",
  "auth/invalid-verification-code": "Incorrect OTP. Please check the OTP and try again.",
  "auth/network-request-failed": "Internet connection unavailable. Please check your connection and try again.",
  "auth/user-disabled": "This account has been disabled — contact the restaurant for help.",
};

export function firebaseErrorMessage(err: unknown): string | null {
  const code = (err as { code?: string } | null)?.code;
  if (typeof code === "string" && code in FIREBASE_ERROR_MESSAGES) return FIREBASE_ERROR_MESSAGES[code];
  return null;
}
