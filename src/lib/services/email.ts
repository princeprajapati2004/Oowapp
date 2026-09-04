import nodemailer from "nodemailer";

let _transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (_transporter) return _transporter;
  const host = process.env.SMTP_HOST;
  const portStr = process.env.SMTP_PORT;
  const name = process.env.SMTP_HELO_NAME;
  const user = process.env.NO_REPLY_EMAIL;
  const pass = process.env.NO_REPLY_EMAIL_PASSWORD;

  // Require explicit SMTP configuration from environment only
  if (!host || !portStr || !user || !pass) {
    console.error('Missing required SMTP environment variables. Set SMTP_HOST, SMTP_PORT, NO_REPLY_EMAIL and NO_REPLY_EMAIL_PASSWORD.');
    throw new Error('SMTP configuration missing in environment');
  }

  const port = Number(portStr);
  const secure = port === 465;

  _transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    name,
    auth: { user, pass },
  });

  // Log transporter creation in server logs (non-sensitive values only)
  console.log(`Email transporter configured: host=${host}, port=${port}, name=${name ?? '<unset>'}, auth=yes`);
  return _transporter;
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  text: string,
): Promise<void> {
  const transporter = getTransporter();
  const fromAddress = process.env.NO_REPLY_EMAIL ?? "noreply@oowapp.in";
  try {
    await transporter.sendMail({
      from: `"OOWAPP" <${fromAddress}>`,
      replyTo: fromAddress,
      to,
      subject,
      html,
      text,
      headers: {
        "X-Mailer": "OOWAPP Mailer",
        Precedence: "transactional",
      },
    });
  } catch (err) {
    console.error('sendEmail failed:', err?.message || err);
    // Surface the error to callers so API routes can return a useful error
    throw err;
  }
}
