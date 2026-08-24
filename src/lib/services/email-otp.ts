import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/services/email";
import { buildVerifyEmailTemplate, buildPasswordResetTemplate } from "@/lib/services/email-templates";

// db.emailVerification becomes available after `prisma migrate dev` regenerates the client.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const emailVerification = (db as any).emailVerification;

const OTP_EXPIRY_MS = 2 * 60 * 1000; // 2 minutes
const MAX_ATTEMPTS = 5;

export type OtpPurpose = "SIGNUP" | "LOGIN";

function generateOtp(): string {
  if (process.env.TEST_OTP) return process.env.TEST_OTP;
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return String(array[0] % 1_000_000).padStart(6, "0");
}

export async function sendVerificationOtp(adminId: string, email: string, name: string): Promise<void> {
  const otp = generateOtp();
  const otpHash = await bcrypt.hash(otp, 10);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);

  // Invalidate any previous OTPs for this admin+purpose
  await emailVerification.deleteMany({ where: { adminId, purpose: "SIGNUP" } });

  await emailVerification.create({
    data: { adminId, purpose: "SIGNUP", otpHash, expiresAt },
  });

  const { html, text } = buildVerifyEmailTemplate(name, otp);
  await sendEmail(email, "Verify your OOWAPP account", html, text);
}

/** Business-owner login is OTP-only — no password. */
export async function sendLoginOtp(adminId: string, email: string, name: string): Promise<void> {
  const otp = generateOtp();
  const otpHash = await bcrypt.hash(otp, 10);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);

  await emailVerification.deleteMany({ where: { adminId, purpose: "LOGIN" } });

  await emailVerification.create({
    data: { adminId, purpose: "LOGIN", otpHash, expiresAt },
  });

  const { html, text } = buildPasswordResetTemplate(name, otp);
  await sendEmail(email, "Reset your OOWAPP password", html, text);
}

export type VerifyOtpResult =
  | { success: true }
  | { success: false; error: string; tooManyAttempts?: boolean };

export async function verifyOtp(
  adminId: string,
  purpose: OtpPurpose,
  otp: string
): Promise<VerifyOtpResult> {
  const record = await emailVerification.findFirst({
    where: { adminId, purpose, usedAt: null },
  });

  if (!record) {
    return { success: false, error: "No verification code found. Please request a new one." };
  }

  if (record.expiresAt < new Date()) {
    await emailVerification.delete({ where: { id: record.id } });
    return { success: false, error: "Verification code has expired. Please request a new one." };
  }

  if (record.attempts >= MAX_ATTEMPTS) {
    return {
      success: false,
      error: "Too many incorrect attempts. Please request a new verification code.",
      tooManyAttempts: true,
    };
  }

  // Constant-time comparison via bcrypt (prevents timing attacks)
  const valid = await bcrypt.compare(otp, record.otpHash);

  if (!valid) {
    await emailVerification.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    });
    const remaining = MAX_ATTEMPTS - record.attempts - 1;
    return {
      success: false,
      error: `Incorrect code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`,
    };
  }

  // Mark as used — prevents replay
  await emailVerification.update({
    where: { id: record.id },
    data: { usedAt: new Date() },
  });

  return { success: true };
}

/** Returns true if a resend is allowed (no recent OTP sent within the last 30s). */
export async function canResendOtp(adminId: string, purpose: OtpPurpose): Promise<boolean> {
  const RESEND_COOLDOWN_MS = 30_000;
  const recent = await emailVerification.findFirst({
    where: {
      adminId,
      purpose,
      createdAt: { gte: new Date(Date.now() - RESEND_COOLDOWN_MS) },
    },
  });
  return !recent;
}
