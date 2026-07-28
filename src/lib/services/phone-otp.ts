import { randomInt } from "crypto";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

export const OTP_EXPIRY_MINUTES = 5;
export const RESEND_COOLDOWN_SECONDS = 60;
const MAX_ATTEMPTS = 5;

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

/** Creates a new OTP row and returns the plaintext code to send — never persisted in plaintext. */
export async function createOtp(shopId: string, phone: string): Promise<string> {
  const code = generateCode();
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60_000);
  await db.phoneOtp.create({ data: { shopId, phone, codeHash, expiresAt } });
  return code;
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

  const matches = await bcrypt.compare(code, otp.codeHash);
  if (!matches) {
    const updated = await db.phoneOtp.update({
      where: { id: otp.id },
      data: { attempts: { increment: 1 } },
    });
    throw new OtpIncorrectError(Math.max(0, MAX_ATTEMPTS - updated.attempts));
  }

  await db.phoneOtp.update({ where: { id: otp.id }, data: { verifiedAt: new Date() } });
}
