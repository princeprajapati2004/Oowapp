import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { getShopById } from "@/lib/services/shop";
import { QrCodeGenerator } from "@/components/admin/qr-code-generator";

export default async function QrPage() {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const shop = await getShopById(session.shopId);

  return <QrCodeGenerator slug={shop.slug} businessName={shop.businessName} businessType={shop.businessType} />;
}
