import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/api-utils";
import { publishOrderEvent, toNotificationEvent } from "@/lib/server/order-events";
import type { NotificationType } from "@/generated/prisma/client";

export async function createNotification(
  shopId: string,
  input: { type: NotificationType; title: string; body: string; link?: string | null }
) {
  const notification = await db.notification.create({
    data: {
      shopId,
      type: input.type,
      title: input.title,
      body: input.body,
      link: input.link ?? null,
    },
  });
  publishOrderEvent(shopId, { type: "notification.created", notification: toNotificationEvent(notification) });
  return notification;
}

export async function listNotifications(shopId: string) {
  return db.notification.findMany({ where: { shopId }, orderBy: { createdAt: "desc" } });
}

export async function countUnread(shopId: string) {
  return db.notification.count({ where: { shopId, isRead: false } });
}

async function assertOwnedNotification(shopId: string, id: string) {
  const notification = await db.notification.findFirst({ where: { id, shopId } });
  if (!notification) throw new NotFoundError("Notification not found");
  return notification;
}

export async function markRead(shopId: string, id: string) {
  await assertOwnedNotification(shopId, id);
  return db.notification.update({ where: { id }, data: { isRead: true } });
}

export async function markAllRead(shopId: string) {
  return db.notification.updateMany({ where: { shopId, isRead: false }, data: { isRead: true } });
}

export async function deleteNotification(shopId: string, id: string) {
  await assertOwnedNotification(shopId, id);
  await db.notification.delete({ where: { id } });
}

export async function clearAll(shopId: string) {
  return db.notification.deleteMany({ where: { shopId } });
}
