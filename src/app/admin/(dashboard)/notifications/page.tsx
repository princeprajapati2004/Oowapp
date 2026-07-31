import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { listNotifications } from "@/lib/services/notification";
import { NotificationCenter } from "@/components/admin/notification-center";

export default async function NotificationsPage() {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const notifications = await listNotifications(session.shopId);
  const initialNotifications = notifications.map((n) => ({
    id: n.id,
    shopId: n.shopId,
    type: n.type,
    title: n.title,
    body: n.body,
    link: n.link,
    isRead: n.isRead,
    createdAt: n.createdAt.toISOString(),
  }));

  return <NotificationCenter initialNotifications={initialNotifications} />;
}
