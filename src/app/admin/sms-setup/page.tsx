import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/session";
import {
  getSmsConfig,
  saveSmsConfig,
  clearSmsAuthKey,
  describeMissing,
} from "@/lib/services/sms-config";
import { sendProviderOtp, testSmsCredentials } from "@/lib/services/sms-provider";

/**
 * Admin → SMS setup.
 *
 * Lets the owner enter the MSG91 credentials from inside the app, so sending
 * OTPs never depends on having access to the hosting dashboard.
 */

export const dynamic = "force-dynamic";

function maskTail(value: string | null): string {
  if (!value) return "not saved";
  return value.length <= 4 ? "••••" : `••••••••${value.slice(-4)}`;
}

async function saveAction(formData: FormData): Promise<void> {
  "use server";
  await requireAdminSession();

  await saveSmsConfig({
    provider: String(formData.get("provider") ?? ""),
    authKey: String(formData.get("authKey") ?? ""),
    widgetId: String(formData.get("widgetId") ?? ""),
    templateId: String(formData.get("templateId") ?? ""),
    otpVar: String(formData.get("otpVar") ?? ""),
    skipCountryCode: formData.get("skipCountryCode") === "on",
  });

  redirect("/admin/sms-setup?status=saved");
}

async function testAction(): Promise<void> {
  "use server";
  await requireAdminSession();

  const result = await testSmsCredentials();
  const status = result.ok ? "test-ok" : "test-failed";
  redirect(`/admin/sms-setup?status=${status}&detail=${encodeURIComponent(result.detail)}`);
}

async function sendTestAction(formData: FormData): Promise<void> {
  "use server";
  await requireAdminSession();

  const phone = String(formData.get("testPhone") ?? "").trim();
  if (!phone) {
    redirect(
      `/admin/sms-setup?status=send-failed&detail=${encodeURIComponent("Enter a phone number first.")}`
    );
  }

  // redirect() works by throwing, so it must stay outside the try block.
  let outcome: { ok: boolean; detail: string };
  try {
    await sendProviderOtp(phone);
    outcome = { ok: true, detail: `A code was sent to ${phone}. Check that handset.` };
  } catch (error) {
    outcome = { ok: false, detail: error instanceof Error ? error.message : String(error) };
  }

  redirect(
    `/admin/sms-setup?status=${outcome.ok ? "send-ok" : "send-failed"}` +
      `&detail=${encodeURIComponent(outcome.detail)}`
  );
}

async function clearKeyAction(): Promise<void> {
  "use server";
  await requireAdminSession();

  await clearSmsAuthKey();
  redirect("/admin/sms-setup?status=key-cleared");
}

const page: Record<string, string> = {
  maxWidth: "640px",
  margin: "0 auto",
  padding: "32px 20px 64px",
  lineHeight: "1.5",
};

const field: Record<string, string> = {
  display: "block",
  width: "100%",
  padding: "10px 12px",
  marginTop: "6px",
  borderRadius: "8px",
  border: "1px solid rgba(128,128,128,0.4)",
  background: "transparent",
  color: "inherit",
  font: "inherit",
};

const label: Record<string, string> = {
  display: "block",
  marginBottom: "18px",
  fontSize: "14px",
  fontWeight: "600",
};

const hint: Record<string, string> = {
  display: "block",
  marginTop: "6px",
  fontSize: "13px",
  fontWeight: "400",
  opacity: "0.7",
};

const button: Record<string, string> = {
  padding: "10px 18px",
  borderRadius: "8px",
  border: "1px solid rgba(128,128,128,0.4)",
  background: "transparent",
  color: "inherit",
  font: "inherit",
  cursor: "pointer",
};

const primaryButton: Record<string, string> = {
  ...button,
  background: "#16a34a",
  borderColor: "#16a34a",
  color: "#fff",
  fontWeight: "600",
};

function banner(tone: "ok" | "bad" | "info"): Record<string, string> {
  const colors = { ok: "#16a34a", bad: "#dc2626", info: "#0284c7" };
  return {
    padding: "12px 14px",
    borderRadius: "8px",
    marginBottom: "24px",
    fontSize: "14px",
    border: `1px solid ${colors[tone]}`,
    color: colors[tone],
  };
}

export default async function SmsSetupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminSession();

  const config = await getSmsConfig();
  const params = await searchParams;
  const status = typeof params.status === "string" ? params.status : null;
  const detail = typeof params.detail === "string" ? params.detail : null;
  const missing = describeMissing(config);

  return (
    <main style={page}>
      <h1 style={{ fontSize: "22px", fontWeight: "700", marginBottom: "8px" }}>SMS setup</h1>
      <p style={{ opacity: "0.75", fontSize: "14px", marginBottom: "28px" }}>
        Customers receive their checkout code through MSG91. Enter the credentials from your
        MSG91 dashboard below — they are stored in your own database, never in the code.
      </p>

      {status === "saved" && <div style={banner("ok")}>Saved. Send yourself a test code to confirm.</div>}
      {status === "key-cleared" && <div style={banner("info")}>The stored auth key was removed.</div>}
      {status === "test-ok" && <div style={banner("ok")}>MSG91 accepted these credentials. {detail}</div>}
      {status === "test-failed" && <div style={banner("bad")}>{detail ?? "The test failed."}</div>}
      {status === "send-ok" && <div style={banner("ok")}>{detail ?? "Test code sent."}</div>}
      {status === "send-failed" && (
        <div style={banner("bad")}>
          <strong>The code could not be sent.</strong>
          <br />
          {detail ?? "No further detail was returned."}
        </div>
      )}

      {missing.length > 0 ? (
        <div style={banner("bad")}>
          OTP sending is off right now. {missing.join(" ")}
        </div>
      ) : (
        <div style={banner("ok")}>OTP sending is configured.</div>
      )}

      <form action={saveAction}>
        <label style={label}>
          Provider
          <select name="provider" defaultValue={config.rawProvider ?? "msg91-widget"} style={field}>
            <option value="msg91-widget">MSG91 Widget — MSG91 sends and checks the code</option>
            <option value="msg91-flow">MSG91 SMS — needs your own approved DLT template</option>
          </select>
          <span style={hint}>Choose the Widget unless you have your own DLT template approved.</span>
        </label>

        <label style={label}>
          Auth key
          <input
            type="password"
            name="authKey"
            autoComplete="off"
            placeholder={config.authKey ? "leave blank to keep the saved key" : "paste your MSG91 auth key"}
            style={field}
          />
          <span style={hint}>Currently saved: {maskTail(config.authKey)}</span>
        </label>

        <label style={label}>
          Widget ID
          <input
            type="text"
            name="widgetId"
            defaultValue={config.widgetId ?? ""}
            placeholder="e.g. 3668756c3663373438353633"
            style={field}
          />
          <span style={hint}>MSG91 → OTP → Widget. Needed for the Widget provider.</span>
        </label>

        <label style={label}>
          Template ID
          <input
            type="text"
            name="templateId"
            defaultValue={config.templateId ?? ""}
            placeholder="only for the MSG91 SMS provider"
            style={field}
          />
        </label>

        <label style={label}>
          Template variable name
          <input type="text" name="otpVar" defaultValue={config.otpVar} style={field} />
          <span style={hint}>
            Must match the variable in your DLT template. Ignored by the Widget provider.
          </span>
        </label>

        <label style={{ ...label, fontWeight: "400" }}>
          <input type="checkbox" name="skipCountryCode" defaultChecked={config.skipCountryCode} />{" "}
          Send the number without the 91 country code
          <span style={hint}>Only tick this if MSG91 rejects numbers that start with 91.</span>
        </label>

        <button type="submit" style={primaryButton}>
          Save settings
        </button>
      </form>

      <div style={{ display: "flex", gap: "12px", marginTop: "28px", flexWrap: "wrap" }}>
        <form action={testAction}>
          <button type="submit" style={button}>
            Test credentials
          </button>
        </form>
        <form action={clearKeyAction}>
          <button type="submit" style={button}>
            Remove saved auth key
          </button>
        </form>
      </div>

      <form action={sendTestAction} style={{ marginTop: "32px" }}>
        <label style={label}>
          Send a real test code
          <input
            type="tel"
            name="testPhone"
            placeholder="your own mobile number"
            style={field}
          />
          <span style={hint}>
            This sends an actual SMS. If it fails, the exact reason from MSG91 is shown above.
          </span>
        </label>
        <button type="submit" style={button}>
          Send test code
        </button>
      </form>

      <p style={{ fontSize: "13px", opacity: "0.7", marginTop: "28px" }}>
        “Test credentials” asks MSG91 to accept the key without messaging anyone. To check
        delivery end to end, place a test order and enter your own number at checkout.
      </p>
    </main>
  );
}
