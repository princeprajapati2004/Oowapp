import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { listCategories } from "@/lib/services/category";
import { listProducts } from "@/lib/services/product";
import { getShopById } from "@/lib/services/shop";
import { serializeProducts } from "@/lib/serialize";
import { formatCurrency } from "@/lib/utils/currency";
import { PrintButton } from "@/components/shared/print-button";

export default async function MenuPrintPage() {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const [categories, products, shop] = await Promise.all([
    listCategories(session.shopId),
    listProducts(session.shopId),
    getShopById(session.shopId),
  ]);

  const serialized = serializeProducts(products);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Print menu</h1>
          <p className="text-muted-foreground">A clean printable copy of your full menu.</p>
        </div>
        <PrintButton label="Print / Save as PDF" />
      </div>

      <div className="mx-auto max-w-2xl rounded-xl border bg-background p-8 print:border-0 print:p-0 print:shadow-none">
        <div className="mb-6 text-center">
          <h2 className="text-2xl font-bold">{shop.businessName}</h2>
          {shop.address ? <p className="text-sm text-muted-foreground">{shop.address}</p> : null}
          {shop.phone ? <p className="text-sm text-muted-foreground">{shop.phone}</p> : null}
        </div>

        {categories.map((category) => {
          const items = serialized.filter((p) => p.categoryId === category.id);
          if (items.length === 0) return null;
          return (
            <div key={category.id} className="mb-6 break-inside-avoid">
              <h3 className="mb-2 border-b pb-1 text-lg font-bold">{category.name}</h3>
              <div className="space-y-1.5">
                {items.map((item) => (
                  <div key={item.id} className="flex justify-between gap-4 text-sm">
                    <span>
                      {item.name}
                      {item.description ? (
                        <span className="ml-1 text-xs text-muted-foreground">— {item.description}</span>
                      ) : null}
                    </span>
                    <span className="shrink-0 font-medium">{formatCurrency(item.price, shop.currency)}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
