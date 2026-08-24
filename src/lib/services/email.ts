import nodemailer from "nodemailer";

let _transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (_transporter) return _transporter;
  _transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "mail.oowapp.in",
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: false,
    auth: {
      user: process.env.NO_REPLY_EMAIL,
      pass: process.env.NO_REPLY_EMAIL_PASSWORD,
    },
    tls: { rejectUnauthorized: false },
  });
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
}
