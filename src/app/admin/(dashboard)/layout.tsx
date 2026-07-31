import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { getShopById } from "@/lib/services/shop";
import { listNotifications } from "@/lib/services/notification";
import { AdminShell } from "@/components/admin/admin-shell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getAdminSession();
  if (!session) {
    redirect("/login");
  }

  const [shop, notifications] = await Promise.all([
    getShopById(session.shopId),
    listNotifications(session.shopId),
  ]);

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

  return (
    <AdminShell shopName={shop.businessName} shopSlug={shop.slug} initialNotifications={initialNotifications}>
      {children}
    </AdminShell>
  );
}
