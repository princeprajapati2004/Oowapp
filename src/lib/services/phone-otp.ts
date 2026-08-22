import { randomInt } from "crypto";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import {
  providerOwnsOtp,
  sendProviderOtp,
  sendOtpSms,
  verifyProviderOtp,
} from "@/lib/services/sms-provider";

export const OTP_EXPIRY_MINUTES = 5;
export const RESEND_COOLDOWN_SECONDS = 60;
const MAX_ATTEMPTS = 5;

/**
 * When MSG91's widget owns the code we have no hash of our own to store, but we
 * still need the row for expiry, attempt counting and the resend cooldown — so
 * the provider's reqId is kept in `codeHash` behind this marker. (If you would
 * rather have a dedicated column, add a nullable `providerRef` to the PhoneOtp
 * model and swap the two helpers below; nothing else changes.)
 */
const PROVIDER_REF_PREFIX = "provider:";

type ShopInfo = { businessName: string };

export class OtpNotFoundError extends Error {
  constructor() {
    super("No verification code found for this number. Please request a new one.");
    this.name = "OtpNotFoundError";
  }
}

export class OtpExpiredError extends Error {
  constructor() {
    super("This code has expired. Please request a new one.");
    this.name = "OtpExpiredError";
  }
}

export class OtpIncorrectError extends Error {
  attemptsLeft: number;
  constructor(attemptsLeft: number) {
    super(
      attemptsLeft > 0
        ? `Incorrect code. ${attemptsLeft} attempt${attemptsLeft === 1 ? "" : "s"} left.`
        : "Too many incorrect attempts. Please request a new code."
    );
    this.name = "OtpIncorrectError";
    this.attemptsLeft = attemptsLeft;
  }
}

function generateCode(): string {
  // Cryptographically random, not Math.random() — this is the one piece of
  // real secret material in the flow.
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/** Seconds the caller must still wait before requesting another code for this phone, 0 if none. */
export async function secondsUntilNextSend(shopId: string, phone: string): Promise<number> {
  const latest = await db.phoneOtp.findFirst({
    where: { shopId, phone },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (!latest) return 0;
  const elapsedSeconds = (Date.now() - latest.createdAt.getTime()) / 1000;
  return Math.max(0, Math.ceil(RESEND_COOLDOWN_SECONDS - elapsedSeconds));
}

/**
 * Sends a code and records it, whichever way the configured provider works.
 *
 * The row is written only after the provider has accepted the send, so a failed
 * send never starts the resend cooldown or leaves a phantom code behind.
 */
export async function startOtp(shopId: string, phone: string, shop: ShopInfo): Promise<void> {
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60_000);

  if (await providerOwnsOtp()) {
    const reference = await sendProviderOtp(phone);
    await db.phoneOtp.create({
      data: { shopId, phone, codeHash: `${PROVIDER_REF_PREFIX}${reference}`, expiresAt },
    });
    return;
  }

  const code = generateCode();
  const codeHash = await bcrypt.hash(code, 10);
  await sendOtpSms(phone, code, shop);
  await db.phoneOtp.create({ data: { shopId, phone, codeHash, expiresAt } });
}

/** Throws one of the Otp*Error types on failure; resolves silently on success. */
export async function verifyOtp(shopId: string, phone: string, code: string): Promise<void> {
  const otp = await db.phoneOtp.findFirst({
    where: { shopId, phone, verifiedAt: null },
    orderBy: { createdAt: "desc" },
  });

  if (!otp) throw new OtpNotFoundError();
  if (otp.expiresAt < new Date()) throw new OtpExpiredError();
  if (otp.attempts >= MAX_ATTEMPTS) throw new OtpIncorrectError(0);

  const matches = otp.codeHash.startsWith(PROVIDER_REF_PREFIX)
    ? await verifyProviderOtp(otp.codeHash.slice(PROVIDER_REF_PREFIX.length), code)
    : await bcrypt.compare(code, otp.codeHash);

  if (!matches) {
    const updated = await db.phoneOtp.update({
      where: { id: otp.id },
      data: { attempts: { increment: 1 } },
    });
    throw new OtpIncorrectError(Math.max(0, MAX_ATTEMPTS - updated.attempts));
  }

  await db.phoneOtp.update({ where: { id: otp.id }, data: { verifiedAt: new Date() } });
}

  await db.phoneOtp.update({ where: { id: otp.id }, data: { verifiedAt: new Date() } });
}
