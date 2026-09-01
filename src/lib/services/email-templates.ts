const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://oowapp.in";

const sharedStyles = `
  body { margin:0; padding:0; background:#f4f4f5; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; }
  .wrapper { max-width:600px; margin:32px auto; background:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,0.08); }
  .header { background:linear-gradient(135deg,#059669 0%,#047857 100%); padding:36px 40px; text-align:center; }
  .header img { width:56px; height:56px; border-radius:12px; }
  .header h1 { margin:12px 0 0; color:#ffffff; font-size:24px; font-weight:700; letter-spacing:-0.5px; }
  .body { padding:40px; }
  .greeting { font-size:17px; color:#111827; font-weight:600; margin:0 0 12px; }
  .text { font-size:15px; color:#374151; line-height:1.6; margin:0 0 24px; }
  .otp-box { background:#f0fdf4; border:2px solid #bbf7d0; border-radius:12px; padding:24px; text-align:center; margin:0 0 24px; }
  .otp-code { font-size:42px; font-weight:700; letter-spacing:10px; color:#065f46; font-family:'Courier New',Courier,monospace; }
  .otp-expiry { font-size:13px; color:#059669; margin:8px 0 0; font-weight:500; }
  .warning { background:#fffbeb; border:1px solid #fde68a; border-radius:8px; padding:14px 16px; font-size:13px; color:#92400e; margin:0 0 24px; }
  .divider { border:none; border-top:1px solid #f3f4f6; margin:24px 0; }
  .footer { background:#f9fafb; padding:24px 40px; text-align:center; border-top:1px solid #f3f4f6; }
  .footer p { font-size:12px; color:#9ca3af; margin:0 0 4px; }
  .footer a { color:#059669; text-decoration:none; }
`;

export type EmailTemplate = { html: string; text: string };

export function buildVerifyEmailTemplate(recipientName: string, otp: string): EmailTemplate {
  const name = recipientName || "there";
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Verify your email — OOWAPP</title>
<style>${sharedStyles}</style></head>
<body>
<div class="wrapper">
  <div class="header">
    <img src="${BASE_URL}/logo_1.webp" alt="OOWAPP" />
    <h1>OOWAPP</h1>
  </div>
  <div class="body">
    <p class="greeting">Hello ${escapeHtml(name)},</p>
    <p class="text">Welcome to OOWAPP! To activate your account, please enter the verification code below.</p>
    <div class="otp-box">
      <div class="otp-code">${otp}</div>
      <p class="otp-expiry">This code expires in <strong>2 minutes</strong></p>
    </div>
    <div class="warning">
      <strong>Security notice:</strong> If you did not create an account on OOWAPP, please ignore this email. Do not share this code with anyone.
    </div>
    <p class="text" style="margin:0;font-size:13px;color:#6b7280;">Need help? Reply to this email and our team will assist you.</p>
  </div>
  <hr class="divider" />
  <div class="footer">
    <p>This is an automated message from OOWAPP</p>
    <p><a href="${BASE_URL}">oowapp.in</a></p>
    <p style="margin-top:8px;">© ${new Date().getFullYear()} OOWAPP. All rights reserved.</p>
  </div>
</div>
</body>
</html>`;

  const text = `Hello ${name},

Welcome to OOWAPP! To activate your account, use the verification code below.

Your verification code: ${otp}

This code expires in 2 minutes.

Security notice: If you did not create an account on OOWAPP, please ignore this email. Do not share this code with anyone.

Need help? Reply to this email and our team will assist you.

---
OOWAPP · oowapp.in
© ${new Date().getFullYear()} OOWAPP. All rights reserved.`;

  return { html, text };
}

export function buildLoginOtpTemplate(recipientName: string, otp: string): EmailTemplate {
  const name = recipientName || "there";
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Your login code — OOWAPP</title>
<style>${sharedStyles}</style></head>
<body>
<div class="wrapper">
  <div class="header">
    <img src="${BASE_URL}/logo_1.webp" alt="OOWAPP" />
    <h1>OOWAPP</h1>
  </div>
  <div class="body">
    <p class="greeting">Hello ${escapeHtml(name)},</p>
    <p class="text">Use the code below to sign in to your OOWAPP account.</p>
    <div class="otp-box">
      <div class="otp-code">${otp}</div>
      <p class="otp-expiry">This code expires in <strong>2 minutes</strong></p>
    </div>
    <div class="warning">
      <strong>Didn't request this?</strong> If you didn't try to sign in, you can safely ignore this email.
    </div>
    <p class="text" style="margin:0;font-size:13px;color:#6b7280;">For security, this code can only be used once and expires in 2 minutes.</p>
  </div>
  <hr class="divider" />
  <div class="footer">
    <p>This is an automated message from OOWAPP</p>
    <p><a href="${BASE_URL}">oowapp.in</a></p>
    <p style="margin-top:8px;">© ${new Date().getFullYear()} OOWAPP. All rights reserved.</p>
  </div>
</div>
</body>
</html>`;

  const text = `Hello ${name},

Use the code below to sign in to your OOWAPP account.

Your login code: ${otp}

This code expires in 2 minutes and can only be used once.

Didn't request this? You can safely ignore this email.

---
OOWAPP · oowapp.in
© ${new Date().getFullYear()} OOWAPP. All rights reserved.`;

  return { html, text };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
