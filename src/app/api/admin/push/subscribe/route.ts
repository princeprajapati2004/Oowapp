import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { db } from "@/lib/db";

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export async function POST(request: Request) {
  try {
    const session = await requireAdminSession();
    const body = await request.json();
    const { endpoint, keys } = subscribeSchema.parse(body);

    // A push endpoint is unique per browser/device, not per shop, so the
    // same endpoint re-subscribing under a different shop's admin session is
    // a legitimate device handover (shared computer, different logged-in
    // admin) — but it must go through an explicit delete + create scoped to
    // this shop rather than a bare upsert-by-endpoint, so ownership always
    // ends up consistent with who is actually authenticated right now.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pushSubscription = db.pushSubscription as any;
    await db.$transaction([
      pushSubscription.deleteMany({ where: { endpoint } }),
      pushSubscription.create({
        data: { shopId: session.shopId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
      }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await requireAdminSession();
    const body = await request.json();
    const { endpoint } = z.object({ endpoint: z.string() }).parse(body);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db.pushSubscription as any)
      .deleteMany({ where: { endpoint, shopId: session.shopId } })
      .catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
