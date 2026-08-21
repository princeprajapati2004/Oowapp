/**
 * SMS provider adapter.
 *
 * Contract: if this function returns without throwing, the SMS provider has
 * accepted the message. It must NEVER return silently when nothing was sent —
 * that is exactly the bug this file replaces.
 */

type ShopInfo = { businessName: string };

const SEND_TIMEOUT_MS = 10_000;
const MSG91_FLOW_URL = "https://control.msg91.com/api/v5/flow";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`[sms] Missing required environment variable ${name}`);
  }
  return value;
}

/**
 * Normalise any Indian-style input into MSG91's expected `91XXXXXXXXXX` form.
 * Handles: 9876543210, 09876543210, +91 98765 43210, 0091-9876543210
 */
export function toMsg91Mobile(raw: string): string {
  const countryCode = (process.env.SMS_COUNTRY_CODE ?? "91").replace(/\D/g, "");
  let digits = raw.replace(/\D/g, "");

  if (digits.startsWith("00")) digits = digits.slice(2);          // 0091... -> 91...
  if (digits.length === 11 && digits.startsWith("0")) {
    digits = digits.slice(1);                                     // 09876... -> 9876...
  }
  if (digits.length > 10 && digits.startsWith(countryCode)) {
    return digits;                                                // already prefixed
  }
  return `${countryCode}${digits}`;
}

async function sendViaMsg91(phone: string, code: string, shop: ShopInfo): Promise<void> {
  const authkey = requireEnv("MSG91_AUTH_KEY");
  const templateId = requireEnv("MSG91_TEMPLATE_ID");

  // These must match the variable names in your approved DLT template.
  const otpVar = process.env.MSG91_OTP_VAR?.trim() || "OTP";
  const brandVar = process.env.MSG91_BRAND_VAR?.trim();

  const recipient: Record<string, string> = {
    mobiles: toMsg91Mobile(phone),
    [otpVar]: code,
  };
  if (brandVar) recipient[brandVar] = shop.businessName;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(MSG91_FLOW_URL, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authkey,
      },
      body: JSON.stringify({
        template_id: templateId,
        short_url: "0",
        realTimeResponse: "1", // makes MSG91 report real failures instead of queueing
        recipients: [recipient],
      }),
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (error) {
    const reason =
      error instanceof Error && error.name === "AbortError"
        ? `timed out after ${SEND_TIMEOUT_MS}ms`
        : error instanceof Error
          ? error.message
          : String(error);
    console.error("[sms] MSG91 request failed:", reason);
    throw new Error(`Could not reach the SMS provider (${reason})`);
  } finally {
    clearTimeout(timer);
  }

  const rawBody = await response.text();
  let payload: { type?: string; message?: unknown } = {};
  try {
    payload = JSON.parse(rawBody) as typeof payload;
  } catch {
    // non-JSON body — handled by the check below
  }

  // MSG91 answers HTTP 200 even when it rejects the message.
  // The real outcome lives in `type`, so both must be checked.
  if (!response.ok || payload.type !== "success") {
    const detail =
      typeof payload.message === "string" ? payload.message : rawBody.slice(0, 300);
    console.error("[sms] MSG91 rejected the OTP send:", {
      httpStatus: response.status,
      detail,
    });
    throw new Error(`SMS provider rejected the request: ${detail || response.status}`);
  }

  // payload.message is MSG91's request id — useful when chasing delivery reports.
  console.info("[sms] OTP queued with MSG91:", payload.message);
}

export async function sendOtpSms(
  phone: string,
  code: string,
  shop: ShopInfo
): Promise<void> {
  const provider = process.env.SMS_PROVIDER?.trim().toLowerCase();

  if (!provider) {
    throw new Error(
      "SMS_PROVIDER is not set — refusing to report success without sending an SMS. " +
        "Set SMS_PROVIDER=msg91 (plus MSG91_AUTH_KEY and MSG91_TEMPLATE_ID)."
    );
  }

  switch (provider) {
    case "msg91":
      return sendViaMsg91(phone, code, shop);
    default:
      throw new Error(`Unsupported SMS_PROVIDER "${provider}". Supported values: msg91`);
  }
}
