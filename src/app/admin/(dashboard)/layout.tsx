import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { getShopById } from "@/lib/services/shop";
import { AdminShell } from "@/components/admin/admin-shell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getAdminSession();
  if (!session) {
    redirect("/admin/login");
  }

  const shop = await getShopById(session.shopId);

  return (
    <AdminShell shopName={shop.businessName} shopSlug={shop.slug}>
      {children}
    </AdminShell>
  );
}
