import { getSmsConfig, describeMissing, type SmsConfig } from "@/lib/services/sms-config";

/**
 * SMS / OTP provider adapter.
 *
 * Settings come from Admin → SMS setup (stored in PlatformSettings), falling
 * back to environment variables. See sms-config.ts.
 *
 * Two modes:
 *   msg91-widget  MSG91 generates, sends AND verifies the code. No DLT template
 *                 of your own needed. sendProviderOtp() returns a reqId that
 *                 must be handed back to verifyProviderOtp().
 *   msg91-flow    We generate the code, MSG91 only delivers it using your own
 *                 DLT-approved template. Verification stays local (bcrypt).
 *
 * Contract: nothing here reports success unless the provider actually accepted
 * the request. Silence is never treated as success.
 */

type ShopInfo = { businessName: string };

const TIMEOUT_MS = 10_000;
const WIDGET_SEND_URL = "https://api.msg91.com/api/v5/widget/sendOtp";
const WIDGET_VERIFY_URL = "https://api.msg91.com/api/v5/widget/verifyOtp";
const FLOW_URL = "https://control.msg91.com/api/v5/flow";

type Msg91Response = { type?: string; message?: unknown };

// Distinct from a generic Error so its deliberately user-safe message reaches
// the client instead of being masked as "Something went wrong" by
// api-utils.ts's generic Error branch — covers config-missing, unreachable
// provider, and rejected-request cases across both send and verify.
export class OtpProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OtpProviderError";
  }
}

async function requireConfig(): Promise<SmsConfig> {
  const config = await getSmsConfig();
  const missing = describeMissing(config);
  if (missing.length > 0) {
    throw new OtpProviderError(
      `SMS is not configured yet, so no code was sent. ${missing.join(" ")} ` +
        "Fix this in Admin → SMS setup."
    );
  }
  return config;
}

/** True when the provider owns the code, so verification must go back to it. */
export async function providerOwnsOtp(): Promise<boolean> {
  const config = await requireConfig();
  return config.provider === "msg91-widget";
}

/**
 * Normalise any Indian-style input into MSG91's `91XXXXXXXXXX` form.
 * Handles: 9876543210, 09876543210, +91 98765 43210, 0091-9876543210
 */
export function toMsg91Mobile(raw: string): string {
  const countryCode = (process.env.SMS_COUNTRY_CODE ?? "91").replace(/\D/g, "");
  let digits = raw.replace(/\D/g, "");

  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length > 10 && digits.startsWith(countryCode)) return digits;
  return `${countryCode}${digits}`;
}

async function postToMsg91(
  url: string,
  body: unknown,
  authkey: string
): Promise<{ status: number; payload: Msg91Response; raw: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authkey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (error) {
    const reason =
      error instanceof Error && error.name === "AbortError"
        ? `timed out after ${TIMEOUT_MS}ms`
        : error instanceof Error
          ? error.message
          : String(error);
    console.error("[sms] MSG91 request failed:", { url, reason });
    throw new OtpProviderError(`Could not reach the SMS provider (${reason})`);
  } finally {
    clearTimeout(timer);
  }

  const raw = await response.text();
  let payload: Msg91Response = {};
  try {
    payload = JSON.parse(raw) as Msg91Response;
  } catch {
    // non-JSON body; callers fall back to the raw text
  }
  return { status: response.status, payload, raw };
}

function describe(payload: Msg91Response, raw: string): string {
  return typeof payload.message === "string" ? payload.message : raw.slice(0, 300);
}

function succeeded(status: number, payload: Msg91Response): boolean {
  // MSG91 answers HTTP 200 even when it rejects a request —
  // the real outcome lives in `type`, so both must be checked.
  return status >= 200 && status < 300 && payload.type === "success";
}

/* -------------------------------------------------------------------------- */
/*  msg91-widget: MSG91 owns the code                                          */
/* -------------------------------------------------------------------------- */

function widgetIdentifier(phone: string, config: SmsConfig): string {
  return config.skipCountryCode ? phone.replace(/\D/g, "").slice(-10) : toMsg91Mobile(phone);
}

/** Asks MSG91 to send a code. Returns the reqId needed to verify it later. */
export async function sendProviderOtp(phone: string): Promise<string> {
  const config = await requireConfig();
  const { status, payload, raw } = await postToMsg91(
    WIDGET_SEND_URL,
    { widgetId: config.widgetId, identifier: widgetIdentifier(phone, config) },
    config.authKey as string
  );

  if (!succeeded(status, payload) || typeof payload.message !== "string") {
    console.error("[sms] MSG91 widget rejected sendOtp:", {
      status,
      detail: describe(payload, raw),
    });
    throw new OtpProviderError(`SMS provider rejected the request: ${describe(payload, raw) || status}`);
  }

  return payload.message; // reqId
}

/**
 * Asks MSG91 whether `code` is correct for a previous send.
 * Returns false for a wrong/expired code; throws when the provider itself is
 * misconfigured or unreachable, so an outage is never shown as "wrong code".
 */
export async function verifyProviderOtp(reference: string, code: string): Promise<boolean> {
  const config = await requireConfig();
  const { status, payload, raw } = await postToMsg91(
    WIDGET_VERIFY_URL,
    { widgetId: config.widgetId, reqId: reference, otp: code },
    config.authKey as string
  );

  if (succeeded(status, payload)) return true;

  const detail = describe(payload, raw);
  const lower = detail.toLowerCase();
  const isWrongCode =
    lower.includes("otp") ||
    lower.includes("invalid") ||
    lower.includes("expire") ||
    lower.includes("mismatch");

  console.warn("[sms] MSG91 widget verifyOtp rejected:", { status, detail });
  if (isWrongCode) return false;

  throw new OtpProviderError(`Could not verify the code with the SMS provider: ${detail || status}`);
}

/* -------------------------------------------------------------------------- */
/*  msg91-flow: we own the code, MSG91 only delivers it                        */
/* -------------------------------------------------------------------------- */

export async function sendOtpSms(phone: string, code: string, shop: ShopInfo): Promise<void> {
  const config = await requireConfig();
  if (config.provider !== "msg91-flow") {
    throw new Error("sendOtpSms() is only valid when the provider is msg91-flow");
  }

  const recipient: Record<string, string> = {
    mobiles: toMsg91Mobile(phone),
    [config.otpVar]: code,
  };
  if (config.brandVar) recipient[config.brandVar] = shop.businessName;

  const { status, payload, raw } = await postToMsg91(
    FLOW_URL,
    {
      template_id: config.templateId,
      short_url: "0",
      realTimeResponse: "1",
      recipients: [recipient],
    },
    config.authKey as string
  );

  if (!succeeded(status, payload)) {
    console.error("[sms] MSG91 flow rejected the OTP send:", {
      status,
      detail: describe(payload, raw),
    });
    throw new OtpProviderError(`SMS provider rejected the request: ${describe(payload, raw) || status}`);
  }
}

/**
 * Checks the saved credentials without messaging a real phone: MSG91 validates
 * the auth key before it ever looks at the identifier, so a deliberately
 * invalid one is enough to tell working credentials from broken ones.
 */
export async function testSmsCredentials(): Promise<{ ok: boolean; detail: string }> {
  const config = await getSmsConfig();
  const missing = describeMissing(config);
  if (missing.length > 0) return { ok: false, detail: missing.join(" ") };

  const { status, payload, raw } = await postToMsg91(
    WIDGET_SEND_URL,
    { widgetId: config.widgetId, identifier: "0" },
    config.authKey as string
  );

  const detail = describe(payload, raw);
  const lower = detail.toLowerCase();

  if (lower.includes("authentication") || lower.includes("authkey")) {
    return { ok: false, detail: `The auth key was rejected by MSG91 — ${detail}` };
  }
  if (lower.includes("widget")) {
    return { ok: false, detail: `The auth key works, but the widget id was rejected — ${detail}` };
  }
  if (lower.includes("identifier") || lower.includes("mobile") || succeeded(status, payload)) {
    return { ok: true, detail: "Credentials accepted by MSG91." };
  }
  return { ok: false, detail: `Unrecognised reply from MSG91 — ${detail}` };
}
