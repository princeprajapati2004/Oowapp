import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { listCoupons } from "@/lib/services/coupon";
import { listCategories } from "@/lib/services/category";
import { listProducts } from "@/lib/services/product";
import { getShopById } from "@/lib/services/shop";
import { isFeatureEnabled } from "@/lib/services/feature-permission";
import { serializeCoupons } from "@/lib/serialize";
import { CouponManager } from "@/components/admin/coupon-manager";
import { FeatureLockedState } from "@/components/admin/feature-locked-state";

export default async function CouponsPage() {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  if (!(await isFeatureEnabled(session.shopId, "coupons"))) {
    return <FeatureLockedState featureLabel="Coupons" />;
  }

  const [coupons, categories, products, shop] = await Promise.all([
    listCoupons(session.shopId),
    listCategories(session.shopId),
    listProducts(session.shopId),
    getShopById(session.shopId),
  ]);

  return (
    <CouponManager
      initialCoupons={serializeCoupons(coupons)}
      categories={categories}
      products={products}
      currency={shop.currency}
    />
  );
}
