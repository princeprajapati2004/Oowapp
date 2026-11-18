import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { handleApiError } from "@/lib/api-utils";
import { UnauthorizedError } from "@/lib/session";
import { runSubscriptionReminderSweep } from "@/lib/services/subscription-reminders";

// Triggered by an external cron (this codebase is self-hosted on a VPS via PM2 —
// see deploy.sh/ecosystem.config.cjs — not Vercel, so there's no platform Cron
// to lean on). A crontab entry on the server hits this once a day with the
// shared secret, e.g.:
//
//   0 9 * * * curl -s -X POST https://oowapp.in/api/cron/subscription-reminders \
//     -H "Authorization: Bearer $CRON_SECRET"
//
// Not session-authenticated (no admin/staff/super-admin is calling this) —
// CRON_SECRET is the only gate, constant-time compared to resist timing attacks.
function assertValidCronSecret(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) throw new UnauthorizedError("CRON_SECRET is not configured");

  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";

  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(provided);
  if (expectedBuf.length !== providedBuf.length || !timingSafeEqual(expectedBuf, providedBuf)) {
    throw new UnauthorizedError("Invalid cron secret");
  }
}

export async function POST(request: Request) {
  try {
    assertValidCronSecret(request);
    const result = await runSubscriptionReminderSweep();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return handleApiError(error);
  }
}
