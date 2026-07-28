// Pluggable SMS/OTP delivery for the Customer Ordering checkout flow. No real
// provider is wired in yet — until SMS_PROVIDER is set, sendOtpSms() only
// logs the code server-side so the flow can be tested locally without a
// paid account. Swap in a real provider by filling in the branch below;
// nothing else in the OTP flow (routes, UI, rate limiting) needs to change.
export async function sendOtpSms(
  phone: string,
  code: string,
  shop: { businessName: string }
): Promise<void> {
  const provider = process.env.SMS_PROVIDER;

  if (!provider) {
    console.log(`[DEV OTP] ${phone}: ${code} (for ${shop.businessName})`);
    return;
  }

  // Example wiring once you have a provider account — uncomment and fill in
  // the matching case, then set SMS_PROVIDER accordingly:
  //
  // if (provider === "twilio") {
  //   const twilio = (await import("twilio")).default(
  //     process.env.TWILIO_ACCOUNT_SID,
  //     process.env.TWILIO_AUTH_TOKEN
  //   );
  //   await twilio.messages.create({
  //     to: `+${phone}`,
  //     from: process.env.TWILIO_FROM_NUMBER,
  //     body: `${code} is your ${shop.businessName} verification code.`,
  //   });
  //   return;
  // }
  //
  // if (provider === "msg91") {
  //   await fetch("https://api.msg91.com/api/v5/otp", {
  //     method: "POST",
  //     headers: { authkey: process.env.MSG91_AUTH_KEY!, "Content-Type": "application/json" },
  //     body: JSON.stringify({ mobile: phone, otp: code, template_id: process.env.MSG91_TEMPLATE_ID }),
  //   });
  //   return;
  // }

  // SMS_PROVIDER is set to something with no matching adapter above — fail
  // loudly rather than silently falling back to dev-mode logging, since an
  // owner who set this expects real messages to go out.
  throw new Error(`SMS_PROVIDER=${provider} has no adapter wired up in src/lib/services/sms-provider.ts yet.`);
}
