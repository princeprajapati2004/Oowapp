/**
 * SMS / OTP provider adapter.
 *
 * Two modes, chosen with the SMS_PROVIDER env var:
 *
 *   msg91-widget  MSG91 generates, sends AND verifies the code. No DLT template
 *                 of your own is needed. `sendProviderOtp()` returns a reqId
 *                 that must be handed back to `verifyProviderOtp()` later.
 *
 *   msg91-flow    We generate the code, MSG91 only delivers the SMS using your
 *                 own DLT-approved template. Verification stays local (bcrypt).
 *
 * Contract: nothing here returns "success" unless the provider actually
 * accepted the request. Silence is never treated as success.
 */

type ShopInfo = { businessName: string };

const TIMEOUT_MS = 10_000;
const WIDGET_SEND_URL = "https://api.msg91.com/api/v5/widget/sendOtp";
const WIDGET_VERIFY_URL = "https://api.msg91.com/api/v5/widget/verifyOtp";
const FLOW_URL = "https://control.msg91.com/api/v5/flow";

type Msg91Response = { type?: string; message?: unknown };

function currentProvider(): string {
  const value = process.env.SMS_PROVIDER?.trim().toLowerCase();
  if (!value) {
    throw new Error(
      "SMS_PROVIDER is not set — refusing to report success without sending an SMS. " +
        "Set SMS_PROVIDER=msg91-widget (or msg91-flow)."
    );
  }
  if (value !== "msg91-widget" && value !== "msg91-flow") {
    throw new Error(
      `Unsupported SMS_PROVIDER "${value}". Supported: msg91-widget, msg91-flow`
    );
  }
  return value;
}

/** True when the provider owns the code, so verification must go back to it. */
export function providerOwnsOtp(): boolean {
  return currentProvider() === "msg91-widget";
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`[sms] Missing required environment variable ${name}`);
  return value;
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
  body: unknown
): Promise<{ status: number; payload: Msg91Response; raw: string }> {
  const authkey = requireEnv("MSG91_AUTH_KEY");
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
    throw new Error(`Could not reach the SMS provider (${reason})`);
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

function widgetIdentifier(phone: string): string {
  return process.env.MSG91_WIDGET_SKIP_COUNTRY_CODE === "1"
    ? phone.replace(/\D/g, "").slice(-10)
    : toMsg91Mobile(phone);
}

/** Asks MSG91 to send a code. Returns the reqId needed to verify it later. */
export async function sendProviderOtp(phone: string): Promise<string> {
  const widgetId = requireEnv("MSG91_WIDGET_ID");
  const { status, payload, raw } = await postToMsg91(WIDGET_SEND_URL, {
    widgetId,
    identifier: widgetIdentifier(phone),
  });

  if (!succeeded(status, payload) || typeof payload.message !== "string") {
    console.error("[sms] MSG91 widget rejected sendOtp:", {
      status,
      detail: describe(payload, raw),
    });
    throw new Error(`SMS provider rejected the request: ${describe(payload, raw) || status}`);
  }

  return payload.message; // reqId
}

/**
 * Asks MSG91 whether `code` is correct for a previous send.
 * Returns false for a wrong/expired code; throws if the provider itself is
 * misconfigured or unreachable, so an outage is never shown as "wrong code".
 */
export async function verifyProviderOtp(reference: string, code: string): Promise<boolean> {
  const widgetId = requireEnv("MSG91_WIDGET_ID");
  const { status, payload, raw } = await postToMsg91(WIDGET_VERIFY_URL, {
    widgetId,
    reqId: reference,
    otp: code,
  });

  if (succeeded(status, payload)) return true;

  const detail = describe(payload, raw);
  const normalised = detail.toLowerCase();
  const isWrongCode =
    normalised.includes("otp") ||
    normalised.includes("invalid") ||
    normalised.includes("expire") ||
    normalised.includes("mismatch");

  console.warn("[sms] MSG91 widget verifyOtp rejected:", { status, detail });
  if (isWrongCode) return false;

  throw new Error(`Could not verify the code with the SMS provider: ${detail || status}`);
}

/* -------------------------------------------------------------------------- */
/*  msg91-flow: we own the code, MSG91 only delivers it                        */
/* -------------------------------------------------------------------------- */

export async function sendOtpSms(
  phone: string,
  code: string,
  shop: ShopInfo
): Promise<void> {
  if (currentProvider() !== "msg91-flow") {
    throw new Error("sendOtpSms() is only valid when SMS_PROVIDER=msg91-flow");
  }

  const templateId = requireEnv("MSG91_TEMPLATE_ID");

  // These names must match the variables in your approved DLT template.
  const otpVar = process.env.MSG91_OTP_VAR?.trim() || "OTP";
  const brandVar = process.env.MSG91_BRAND_VAR?.trim();

  const recipient: Record<string, string> = {
    mobiles: toMsg91Mobile(phone),
    [otpVar]: code,
  };
  if (brandVar) recipient[brandVar] = shop.businessName;

  const { status, payload, raw } = await postToMsg91(FLOW_URL, {
    template_id: templateId,
    short_url: "0",
    realTimeResponse: "1",
    recipients: [recipient],
  });

  if (!succeeded(status, payload)) {
    console.error("[sms] MSG91 flow rejected the OTP send:", {
      status,
      detail: describe(payload, raw),
    });
    throw new Error(`SMS provider rejected the request: ${describe(payload, raw) || status}`);
  }
}
