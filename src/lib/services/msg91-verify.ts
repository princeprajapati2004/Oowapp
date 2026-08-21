import { SignJWT, jwtVerify } from "jose";

// Server-side MSG91 OTP integration — uses MSG91's server-to-server widget
// API (authkey-authenticated) rather than the client-side widget SDK. The
// client SDK needs a separate "tokenAuth" credential, a script load, a
// domain allowlist, and an activated (non-draft) widget — all real failure
// points hit while wiring this up. The server API sidesteps every one of
// them: our server calls MSG91 directly with the account's Auth Key, same
// trust level as any other server-to-server integration in this app.
//
// Flow: sendMsg91Otp() gets a reqId from MSG91 and we mint our own signed
// token binding {reqId, phone, shopId} (signMsg91Send) so the browser only
// ever holds an opaque, tamper-proof token — never the raw reqId, and never
// a chance to claim a different phone number at verify time. verifyMsg91Otp()
// confirms the code against MSG91; the phone used afterward always comes
// from our own verified token, never from client input.

const MSG91_API_BASE = "https://api.msg91.com/api/v5/widget";
const SEND_TOKEN_TTL = "10m";

const MSG91_SEND_JWT_SECRET = new TextEncoder().encode(
  process.env.CUSTOMER_JWT_SECRET ?? "insecure-dev-customer-secret"
);

export class Msg91TokenError extends Error {}

function requireConfig(): { authKey: string; widgetId: string } {
  const authKey = process.env.MSG91_AUTH_KEY;
  const widgetId = process.env.NEXT_PUBLIC_MSG91_WIDGET_ID;
  if (!authKey || !widgetId) throw new Msg91TokenError("MSG91 is not configured.");
  return { authKey, widgetId };
}

// MSG91 wants the mobile number as digits-only with country code, no "+" —
// same Indian-first assumption as firebase-otp-helpers.toE164, just without
// the leading plus (mirrors src/lib/msg91-client.ts's toMsg91Identifier,
// duplicated here to keep this file free of "use client" import concerns).
function toMsg91Identifier(raw: string): string {
  const digits = raw.trim().replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

/** Sends an OTP via MSG91 and returns the reqId needed to verify it. */
export async function sendMsg91Otp(phone: string): Promise<string> {
  const { authKey, widgetId } = requireConfig();
  const identifier = toMsg91Identifier(phone);

  let response: Response;
  try {
    response = await fetch(`${MSG91_API_BASE}/sendOtp`, {
      method: "POST",
      headers: { authkey: authKey, "content-type": "application/json" },
      body: JSON.stringify({ widgetId, identifier }),
    });
  } catch {
    throw new Msg91TokenError("Couldn't reach the verification service — please try again.");
  }

  const data = await parseJson(response);
  if (data.type !== "success" || typeof data.message !== "string") {
    throw new Msg91TokenError(typeof data.message === "string" ? data.message : "Couldn't send the code — try again.");
  }
  return data.message; // reqId
}

/** Verifies the OTP against MSG91 for the given reqId — throws on any failure. */
export async function verifyMsg91Otp(reqId: string, otp: string): Promise<void> {
  const { authKey, widgetId } = requireConfig();

  let response: Response;
  try {
    response = await fetch(`${MSG91_API_BASE}/verifyOtp`, {
      method: "POST",
      headers: { authkey: authKey, "content-type": "application/json" },
      body: JSON.stringify({ widgetId, reqId, otp }),
    });
  } catch {
    throw new Msg91TokenError("Couldn't reach the verification service — please try again.");
  }

  const data = await parseJson(response);
  if (data.type !== "success") {
    throw new Msg91TokenError("Incorrect or expired code — please try again.");
  }
}

async function parseJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const data = await response.json();
    return (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  } catch {
    throw new Msg91TokenError("Unexpected response from the verification service.");
  }
}

interface Msg91SendPayload {
  reqId: string;
  phone: string;
  shopId: string;
}

/** Signs {reqId, phone, shopId} into an opaque token — this, not the raw reqId, is what the client holds between send and verify. */
export async function signMsg91Send(payload: Msg91SendPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(SEND_TOKEN_TTL)
    .sign(MSG91_SEND_JWT_SECRET);
}

/** Recovers {reqId, phone, shopId} from a signMsg91Send token, or null if invalid/expired/tampered. */
export async function verifyMsg91SendToken(token: string): Promise<Msg91SendPayload | null> {
  try {
    const { payload } = await jwtVerify(token, MSG91_SEND_JWT_SECRET);
    if (
      typeof payload.reqId === "string" &&
      typeof payload.phone === "string" &&
      typeof payload.shopId === "string"
    ) {
      return { reqId: payload.reqId, phone: payload.phone, shopId: payload.shopId };
    }
    return null;
  } catch {
    return null;
  }
}
