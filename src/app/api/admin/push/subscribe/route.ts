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

    // Upsert — idempotent if same endpoint registers again
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db.pushSubscription as any).upsert({
      where: { endpoint },
      create: { shopId: session.shopId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
      update: { shopId: session.shopId, p256dh: keys.p256dh, auth: keys.auth },
    });

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
