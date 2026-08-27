import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { listProducts } from "@/lib/services/product";
import { listSuppliersForPicker } from "@/lib/services/purchase";
import { PurchaseForm } from "@/components/admin/purchases/purchase-form";

export default async function NewPurchasePage() {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const [products, suppliers] = await Promise.all([listProducts(session.shopId), listSuppliersForPicker(session.shopId)]);

  return (
    <PurchaseForm
      products={products.map((p) => ({ id: p.id, name: p.name, unit: p.unit, costPrice: p.costPrice != null ? Number(p.costPrice) : null }))}
      suppliers={suppliers}
    />
  );
}
