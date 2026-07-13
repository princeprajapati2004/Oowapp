"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { Search, ShoppingCart, PackageSearch } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { ProductCard } from "@/components/customer/product-card";
import { ItemDetailSheet } from "@/components/customer/item-detail-sheet";
import { OrderSheet } from "@/components/customer/order-sheet";
import { useCart } from "@/lib/hooks/use-cart";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils";
import type {
  CustomerCategory,
  CustomerProduct,
  CustomerShop,
  CustomerTax,
} from "@/lib/types/customer";

export function CustomerMenu({
  shop,
  categories,
  products,
  taxes,
}: {
  shop: CustomerShop;
  categories: CustomerCategory[];
  products: CustomerProduct[];
  taxes: CustomerTax[];
}) {
  const cart = useCart(shop.slug);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [selectedProduct, setSelectedProduct] = useState<CustomerProduct | null>(null);
  const [orderSheetOpen, setOrderSheetOpen] = useState(false);

  const visibleProducts = useMemo(() => products.filter((p) => p.isVisible), [products]);

  const filtered = useMemo(() => {
    return visibleProducts.filter((p) => {
      const matchesCategory = activeCategory === "all" || p.categoryId === activeCategory;
      const matchesSearch =
        !search ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.description ?? "").toLowerCase().includes(search.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [visibleProducts, activeCategory, search]);

  const categoriesWithProducts = useMemo(
    () => categories.filter((c) => visibleProducts.some((p) => p.categoryId === c.id)),
    [categories, visibleProducts]
  );

  const subtotal = cart.items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  function handleAddToCart(quantity: number) {
    if (!selectedProduct) return;
    cart.addItem(
      {
        productId: selectedProduct.id,
        name: selectedProduct.name,
        price: selectedProduct.price,
        categoryId: selectedProduct.categoryId,
      },
      quantity
    );
    setSelectedProduct(null);
  }

  return (
    <div className="min-h-screen bg-muted/30 pb-28">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          {shop.logoUrl ? (
            <Image
              src={shop.logoUrl}
              alt={shop.businessName}
              width={40}
              height={40}
              unoptimized
              className="size-10 shrink-0 rounded-full object-cover"
            />
          ) : null}
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-bold leading-tight">{shop.businessName}</h1>
            <p className="text-xs text-muted-foreground">Scan, order, done.</p>
          </div>
          <ThemeToggle />
        </div>
        <div className="mx-auto max-w-3xl px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search menu…"
              className="pl-9"
            />
          </div>
        </div>
        {categoriesWithProducts.length > 1 ? (
          <div className="mx-auto max-w-3xl overflow-x-auto px-4 pb-3">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setActiveCategory("all")}
                className={cn(
                  "shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium",
                  activeCategory === "all" ? "bg-primary text-primary-foreground" : "bg-background"
                )}
              >
                All
              </button>
              {categoriesWithProducts.map((c) => (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => setActiveCategory(c.id)}
                  className={cn(
                    "shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium",
                    activeCategory === c.id ? "bg-primary text-primary-foreground" : "bg-background"
                  )}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </header>

      <main className="mx-auto max-w-3xl px-4 py-4">
        {filtered.length === 0 ? (
          <EmptyState
            icon={PackageSearch}
            title="No items found"
            description="Try a different search or category."
          />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {filtered.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                currency={shop.currency}
                quantityInCart={cart.quantityOf(product.id)}
                onOpen={() => setSelectedProduct(product)}
              />
            ))}
          </div>
        )}
      </main>

      {cart.totalQuantity > 0 ? (
        <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
          <Button
            size="lg"
            onClick={() => setOrderSheetOpen(true)}
            className="flex w-full max-w-sm items-center justify-between gap-3 bg-emerald-600 text-white shadow-lg hover:bg-emerald-700"
          >
            <span className="flex items-center gap-2">
              <ShoppingCart className="size-4" />
              {cart.totalQuantity} item{cart.totalQuantity > 1 ? "s" : ""}
            </span>
            <span>{formatCurrency(subtotal, shop.currency)}</span>
          </Button>
        </div>
      ) : null}

      <ItemDetailSheet
        product={selectedProduct}
        currency={shop.currency}
        initialQuantity={selectedProduct ? cart.quantityOf(selectedProduct.id) : 1}
        onClose={() => setSelectedProduct(null)}
        onAddToCart={handleAddToCart}
      />

      <OrderSheet
        open={orderSheetOpen}
        onOpenChange={setOrderSheetOpen}
        items={cart.items}
        onSetQuantity={cart.setQuantity}
        onRemove={cart.removeItem}
        onOrderPlaced={() => {
          cart.clear();
          setOrderSheetOpen(false);
        }}
        shop={shop}
        taxes={taxes}
      />
    </div>
  );
}
