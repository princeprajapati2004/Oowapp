import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/session";
import { handleApiError } from "@/lib/api-utils";
import { notificationBulkActionSchema } from "@/lib/validation/notification";
import { listNotifications, countUnread, markAllRead, clearAll } from "@/lib/services/notification";

export async function GET() {
  try {
    const session = await requireAdminSession();
    const [notifications, unreadCount] = await Promise.all([
      listNotifications(session.shopId),
      countUnread(session.shopId),
    ]);
    return NextResponse.json({ notifications, unreadCount });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await requireAdminSession();
    const body = await request.json();
    notificationBulkActionSchema.parse(body);
    await markAllRead(session.shopId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE() {
  try {
    const session = await requireAdminSession();
    await clearAll(session.shopId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
