import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { getShopById } from "@/lib/services/shop";
import { BarcodeCreator } from "@/components/admin/barcode-creator";

export default async function BarcodesPage() {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const shop = await getShopById(session.shopId);

  return <BarcodeCreator businessName={shop.businessName} />;
}
