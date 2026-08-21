import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handleApiError, NotFoundError } from "@/lib/api-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { sendMsg91Otp, signMsg91Send, Msg91TokenError } from "@/lib/services/msg91-verify";

const schema = z.object({
  shopSlug: z.string(),
  phone: z
    .string()
    .trim()
    .min(8, "Enter a valid phone number")
    .max(20)
    .regex(/^[0-9+]+$/, "Digits only, include country code (e.g. 91XXXXXXXXXX)"),
});

// Shared by both MSG91 verification surfaces (checkout PhoneVerification and
// customer login OTP) — sending doesn't differ between them, only what
// happens after a successful verify does (see verify-msg91 and
// login-otp-msg91). Returns a signed token binding {reqId, phone, shopId}
// rather than the raw MSG91 reqId, so the browser can hold it between send
// and verify without ever being able to claim a different phone number.
export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (!checkRateLimit(`otp-send-msg91:${ip}`, 10, 15 * 60_000)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const body = await request.json();
    const input = schema.parse(body);

    const shop = await db.shop.findUnique({ where: { slug: input.shopSlug }, select: { id: true } });
    if (!shop) throw new NotFoundError("Shop not found");

    if (!checkRateLimit(`otp-send-msg91-phone:${shop.id}:${input.phone}`, 5, 15 * 60_000)) {
      return NextResponse.json(
        { error: "Too many codes requested for this number — please wait a while." },
        { status: 429 }
      );
    }

    const reqId = await sendMsg91Otp(input.phone);
    const token = await signMsg91Send({ reqId, phone: input.phone, shopId: shop.id });

    return NextResponse.json({ ok: true, token });
  } catch (error) {
    if (error instanceof Msg91TokenError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    return handleApiError(error);
  }
}
