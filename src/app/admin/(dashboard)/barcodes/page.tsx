import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { getShopById } from "@/lib/services/shop";
import { isFeatureEnabled } from "@/lib/services/feature-permission";
import { BarcodeCreator } from "@/components/admin/barcode-creator";
import { FeatureLockedState } from "@/components/admin/feature-locked-state";

export default async function BarcodesPage() {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  if (!(await isFeatureEnabled(session.shopId, "barcode_scanner"))) {
    return <FeatureLockedState featureLabel="Barcode Scanner" />;
  }

  const shop = await getShopById(session.shopId);

  return <BarcodeCreator businessName={shop.businessName} />;
}
