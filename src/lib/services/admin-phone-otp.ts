import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import {
  providerOwnsOtp,
  sendProviderOtp,
  sendOtpSms,
  verifyProviderOtp,
} from "@/lib/services/sms-provider";
import {
  OTP_EXPIRY_MINUTES,
  RESEND_COOLDOWN_SECONDS,
  OtpNotFoundError,
  OtpExpiredError,
  OtpIncorrectError,
} from "@/lib/services/phone-otp";

export { OTP_EXPIRY_MINUTES, RESEND_COOLDOWN_SECONDS, OtpNotFoundError, OtpExpiredError, OtpIncorrectError };

const MAX_ATTEMPTS = 5;

/**
 * Owner mobile-number verification during onboarding — same MSG91 adapter and
 * expiry/attempt/cooldown rules as the customer-facing phone-otp.ts, just
 * keyed by adminId instead of (shopId, phone) since there's no shop-scoped
 * concern here (the owner is verifying their own number).
 */
const PROVIDER_REF_PREFIX = "provider:";

/** Seconds the caller must still wait before requesting another code, 0 if none. */
export async function secondsUntilNextAdminResend(adminId: string): Promise<number> {
  const latest = await db.phoneVerification.findFirst({
    where: { adminId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (!latest) return 0;
  const elapsedSeconds = (Date.now() - latest.createdAt.getTime()) / 1000;
  return Math.max(0, Math.ceil(RESEND_COOLDOWN_SECONDS - elapsedSeconds));
}

export async function startAdminPhoneOtp(
  adminId: string,
  phone: string,
  businessName: string
): Promise<void> {
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60_000);

  if (await providerOwnsOtp()) {
    const reference = await sendProviderOtp(phone);
    await db.phoneVerification.create({
      data: { adminId, phone, codeHash: `${PROVIDER_REF_PREFIX}${reference}`, expiresAt },
    });
    return;
  }

  const code = String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
  const codeHash = await bcrypt.hash(code, 10);
  await sendOtpSms(phone, code, { businessName });
  await db.phoneVerification.create({ data: { adminId, phone, codeHash, expiresAt } });
}

/** Throws one of the Otp*Error types on failure; resolves silently on success. */
export async function verifyAdminPhoneOtp(adminId: string, code: string): Promise<void> {
  const record = await db.phoneVerification.findFirst({
    where: { adminId, verifiedAt: null },
    orderBy: { createdAt: "desc" },
  });

  if (!record) throw new OtpNotFoundError();
  if (record.expiresAt < new Date()) throw new OtpExpiredError();
  if (record.attempts >= MAX_ATTEMPTS) throw new OtpIncorrectError(0);

  const matches = record.codeHash.startsWith(PROVIDER_REF_PREFIX)
    ? await verifyProviderOtp(record.codeHash.slice(PROVIDER_REF_PREFIX.length), code)
    : await bcrypt.compare(code, record.codeHash);

  if (!matches) {
    const updated = await db.phoneVerification.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    });
    throw new OtpIncorrectError(Math.max(0, MAX_ATTEMPTS - updated.attempts));
  }

  await db.phoneVerification.update({ where: { id: record.id }, data: { verifiedAt: new Date() } });
  await db.admin.update({ where: { id: adminId }, data: { phoneVerified: true } });
}
