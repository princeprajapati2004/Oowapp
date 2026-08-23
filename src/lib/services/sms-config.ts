import { db } from "@/lib/db";

/**
 * Where the SMS settings live.
 *
 * They are read from the PlatformSettings table first (editable from
 * Admin → SMS setup, so no hosting access is needed), and fall back to
 * environment variables when a value has not been saved there.
 */

export type SmsProvider = "msg91-widget" | "msg91-flow";

export const SMS_SETTING_KEYS = {
  provider: "sms.provider",
  authKey: "sms.msg91AuthKey",
  widgetId: "sms.msg91WidgetId",
  templateId: "sms.msg91TemplateId",
  otpVar: "sms.msg91OtpVar",
  brandVar: "sms.msg91BrandVar",
  skipCountryCode: "sms.msg91SkipCountryCode",
} as const;

export type SmsConfig = {
  /** The configured value, only when it is one we support. */
  provider: SmsProvider | null;
  /** Exactly what was configured, so a typo can be reported back. */
  rawProvider: string | null;
  authKey: string | null;
  widgetId: string | null;
  templateId: string | null;
  otpVar: string;
  brandVar: string | null;
  skipCountryCode: boolean;
  storedInDatabase: boolean;
};

const CACHE_MS = 30_000;
let cached: { value: SmsConfig; at: number } | null = null;

/** Call after saving so the next send picks the new values up immediately. */
export function clearSmsConfigCache(): void {
  cached = null;
}

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function getSmsConfig(): Promise<SmsConfig> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;

  const rows: Array<{ key: string; value: string }> = await db.platformSettings.findMany({
    where: { key: { in: Object.values(SMS_SETTING_KEYS) } },
    select: { key: true, value: true },
  });

  const stored = new Map(rows.map((row) => [row.key, row.value]));
  const pick = (key: string, envName: string): string | null =>
    clean(stored.get(key)) ?? clean(process.env[envName]);

  const rawProvider = pick(SMS_SETTING_KEYS.provider, "SMS_PROVIDER");
  const normalised = rawProvider?.toLowerCase() ?? null;
  const provider: SmsProvider | null =
    normalised === "msg91-widget" || normalised === "msg91-flow" ? normalised : null;

  const value: SmsConfig = {
    provider,
    rawProvider,
    authKey: pick(SMS_SETTING_KEYS.authKey, "MSG91_AUTH_KEY"),
    widgetId: pick(SMS_SETTING_KEYS.widgetId, "MSG91_WIDGET_ID"),
    templateId: pick(SMS_SETTING_KEYS.templateId, "MSG91_TEMPLATE_ID"),
    otpVar: pick(SMS_SETTING_KEYS.otpVar, "MSG91_OTP_VAR") ?? "OTP",
    brandVar: pick(SMS_SETTING_KEYS.brandVar, "MSG91_BRAND_VAR"),
    skipCountryCode:
      (pick(SMS_SETTING_KEYS.skipCountryCode, "MSG91_WIDGET_SKIP_COUNTRY_CODE") ?? "0") === "1",
    storedInDatabase: rows.length > 0,
  };

  cached = { value, at: Date.now() };
  return value;
}

/**
 * Saves settings. A blank value clears that setting — except `authKey`, where
 * blank means "keep the key already saved", so the form never has to redisplay it.
 */
export async function saveSmsConfig(input: {
  provider?: string;
  authKey?: string;
  widgetId?: string;
  templateId?: string;
  otpVar?: string;
  brandVar?: string;
  skipCountryCode?: boolean;
}): Promise<void> {
  const updates: Array<[string, string | null]> = [
    [SMS_SETTING_KEYS.provider, clean(input.provider)],
    [SMS_SETTING_KEYS.widgetId, clean(input.widgetId)],
    [SMS_SETTING_KEYS.templateId, clean(input.templateId)],
    [SMS_SETTING_KEYS.otpVar, clean(input.otpVar)],
    [SMS_SETTING_KEYS.brandVar, clean(input.brandVar)],
    [SMS_SETTING_KEYS.skipCountryCode, input.skipCountryCode ? "1" : null],
  ];

  const authKey = clean(input.authKey);
  if (authKey) updates.push([SMS_SETTING_KEYS.authKey, authKey]);

  for (const [key, value] of updates) {
    if (value === null) {
      await db.platformSettings.deleteMany({ where: { key } });
    } else {
      await db.platformSettings.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      });
    }
  }

  clearSmsConfigCache();
}

/** Removes the saved key so a leaked one can be revoked from the UI. */
export async function clearSmsAuthKey(): Promise<void> {
  await db.platformSettings.deleteMany({ where: { key: SMS_SETTING_KEYS.authKey } });
  clearSmsConfigCache();
}

/** Everything needed to send, or the list of what is still missing. */
export function describeMissing(config: SmsConfig): string[] {
  const missing: string[] = [];
  if (!config.rawProvider) {
    missing.push('Provider is not chosen — pick "MSG91 Widget".');
  } else if (!config.provider) {
    missing.push(`Provider "${config.rawProvider}" is not supported.`);
  }
  if (!config.authKey) missing.push("MSG91 auth key is missing.");
  if (config.provider === "msg91-widget" && !config.widgetId) {
    missing.push("MSG91 widget id is missing.");
  }
  if (config.provider === "msg91-flow" && !config.templateId) {
    missing.push("MSG91 template id is missing.");
  }
  return missing;
}
