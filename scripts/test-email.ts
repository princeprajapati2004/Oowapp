/**
 * Run with: npx tsx scripts/test-email.ts
 * Fill in SMTP_* vars below or set them in your environment.
 */
import nodemailer from "nodemailer";

const SMTP_HOST     = process.env.SMTP_HOST     ?? "mail.oowapp.in";
const SMTP_PORT     = Number(process.env.SMTP_PORT ?? 587);
const NO_REPLY_EMAIL    = process.env.NO_REPLY_EMAIL    ?? "noreply@oowapp.in";
const NO_REPLY_PASSWORD = process.env.NO_REPLY_EMAIL_PASSWORD ?? "Oowapp@noreply@10216";
const TO = "princegprajapati2023@gmail.com";

if (!NO_REPLY_EMAIL || !NO_REPLY_PASSWORD) {
  console.error(
    "Set NO_REPLY_EMAIL and NO_REPLY_EMAIL_PASSWORD env vars before running.\n" +
    "Example:\n  NO_REPLY_EMAIL=noreply@oowapp.in NO_REPLY_EMAIL_PASSWORD=xxx npx tsx scripts/test-email.ts"
  );
  process.exit(1);
}

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: false,
  name: process.env.SMTP_HELO_NAME ?? "oowapp.in",
  auth: { user: NO_REPLY_EMAIL, pass: NO_REPLY_PASSWORD },
  logger: true,
  debug: true,
});

async function main() {
  console.log(`Verifying SMTP connection to ${SMTP_HOST}:${SMTP_PORT} ...`);
  await transporter.verify();
  console.log("✓ SMTP connection OK\n");

  console.log(`Sending test email to ${TO} ...`);
  const info = await transporter.sendMail({
    from: `"OOWAPP Test" <${NO_REPLY_EMAIL}>`,
    to: TO,
    subject: "OOWAPP test mail",
    text: "This is a plain-text test email from OOWAPP nodemailer script.",
    html: "<p>This is a <strong>test email 001</strong> from OOWAPP nodemailer script.</p>",
  });

  console.log("\n✓ Sent!");
  console.log("  Message-ID:", info.messageId);
  console.log("  Response:  ", info.response);
}

main().catch((err) => {
  console.error("\n✗ Failed:", err.message);
  process.exit(1);
});
