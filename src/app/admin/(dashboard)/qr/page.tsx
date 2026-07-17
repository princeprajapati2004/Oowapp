import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { getShopById } from "@/lib/services/shop";
import { QrCodeGenerator } from "@/components/admin/qr-code-generator";

export default async function QrPage() {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const shop = await getShopById(session.shopId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const shopAny = shop as any;
  let configuredTables: string[] | undefined;
  if (shopAny.enableTableQr && shopAny.tableNames) {
    try {
      configuredTables = JSON.parse(shopAny.tableNames) as string[];
    } catch {
      configuredTables = undefined;
    }
  }

  return (
    <QrCodeGenerator
      slug={shop.slug}
      businessName={shop.businessName}
      businessType={shop.businessType}
      configuredTables={configuredTables}
    />
  );
}
