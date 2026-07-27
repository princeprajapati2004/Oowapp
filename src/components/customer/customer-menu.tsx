"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, ShoppingCart, PackageSearch, History, LogIn, LogOut } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { InstallApp } from "@/components/shared/install-app";
import { ProductCard } from "@/components/customer/product-card";
import { OrderSheet } from "@/components/customer/order-sheet";
import { useCart } from "@/lib/hooks/use-cart";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api-client";
import type {
  ActiveSession,
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
  prefilledTable,
  customer,
  activeSession,
}: {
  shop: CustomerShop;
  categories: CustomerCategory[];
  products: CustomerProduct[];
  taxes: CustomerTax[];
  prefilledTable?: string;
  customer?: { name: string; phone: string } | null;
  activeSession?: ActiveSession;
}) {
  const router = useRouter();
  const cart = useCart(shop.slug);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [orderSheetOpen, setOrderSheetOpen] = useState(false);

  // Drives the sticky bottom panel's mount/unmount so it can slide+fade+scale
  // out smoothly instead of vanishing the instant the cart empties — plain
  // conditional rendering has no exit transition, so the panel stays mounted
  // through a "leaving" phase (via the render-phase state adjustment below,
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes)
  // before a single effect unmounts it once the exit animation finishes.
  const hasItems = cart.totalQuantity > 0;
  const [phase, setPhase] = useState<"hidden" | "visible" | "leaving">(hasItems ? "visible" : "hidden");
  const [prevHasItems, setPrevHasItems] = useState(hasItems);
  // "Add to Cart" the first time this session's cart fills up, "View Cart"
  // once they've already opened the review sheet — resets once the cart
  // empties so starting fresh reads "Add to Cart" again.
  const [hasOpenedCart, setHasOpenedCart] = useState(false);

  if (hasItems !== prevHasItems) {
    setPrevHasItems(hasItems);
    if (hasItems) {
      setPhase("visible");
    } else {
      setPhase("leaving");
      setHasOpenedCart(false);
    }
  }

  useEffect(() => {
    if (phase !== "leaving") return;
    const timer = setTimeout(() => setPhase("hidden"), 260);
    return () => clearTimeout(timer);
  }, [phase]);

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

  // Snapshot of the last non-empty cart so the panel keeps showing real
  // numbers while it plays its exit animation, instead of flashing to 0.
  const [displayTotals, setDisplayTotals] = useState({ qty: cart.totalQuantity, total: subtotal });
  if (hasItems && (displayTotals.qty !== cart.totalQuantity || displayTotals.total !== subtotal)) {
    setDisplayTotals({ qty: cart.totalQuantity, total: subtotal });
  }
  const displayQty = displayTotals.qty;
  const displayTotal = displayTotals.total;

  // The cart only ever holds items with quantity > 0 (see use-cart.ts), so a
  // product not yet in the cart needs addItem (which creates the entry) for
  // its first "+"; every change after that is a plain setQuantity, which
  // already removes the item once quantity drops to 0.
  function handleQuantityChange(product: CustomerProduct, quantity: number) {
    if (cart.quantityOf(product.id) === 0 && quantity > 0) {
      cart.addItem(
        { productId: product.id, name: product.name, price: product.price, categoryId: product.categoryId },
        quantity
      );
    } else {
      cart.setQuantity(product.id, quantity);
    }
  }

  async function handleLogout() {
    await api.post("/api/customer/auth/logout");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-muted/20 pb-40" style={{ paddingBottom: 'calc(10rem + env(safe-area-inset-bottom))' }}>
      <header className="sticky top-0 z-30 border-b bg-background/98 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          {shop.logoUrl ? (
            <Image
              src={shop.logoUrl}
              alt={shop.businessName}
              width={40}
              height={40}
              unoptimized
              className="size-10 shrink-0 rounded-full object-cover ring-2 ring-border"
            />
          ) : (
            <div className="size-10 shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-sm font-bold text-primary">{shop.businessName[0]}</span>
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-bold leading-tight text-base">{shop.businessName}</h1>
            <p className="text-xs text-muted-foreground">Scan, order, done.</p>
          </div>
          <Button variant="ghost" size="icon" aria-label="Your orders" render={<Link href={`/order/${shop.slug}/orders`} />} nativeButton={false}>
            <History className="size-4.5" />
          </Button>
          {customer ? (
            <Button variant="ghost" size="icon" aria-label={`Log out (${customer.name})`} onClick={handleLogout}>
              <LogOut className="size-4.5" />
            </Button>
          ) : (
            <Button variant="ghost" size="icon" aria-label="Log in" render={<Link href={`/order/${shop.slug}/login`} />} nativeButton={false}>
              <LogIn className="size-4.5" />
            </Button>
          )}
          <InstallApp className="hidden sm:flex" />
          <ThemeToggle />
        </div>
        <div className="mx-auto max-w-3xl px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search menu…"
              className="pl-9 h-10 bg-muted/50 border-transparent focus:border-input focus:bg-background transition-colors"
            />
          </div>
        </div>
        {categoriesWithProducts.length > 1 ? (
          <div className="mx-auto max-w-3xl overflow-x-auto px-4 pb-3">
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setActiveCategory("all")}
                className={cn(
                  "shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-200",
                  activeCategory === "all"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
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
                    "shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-200",
                    activeCategory === c.id
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                  )}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </header>

      <main className="mx-auto max-w-3xl px-4 py-5">
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
                onQuantityChange={(quantity) => handleQuantityChange(product, quantity)}
              />
            ))}
          </div>
        )}
      </main>

      {phase !== "hidden" ? (
        <div
          className="fixed inset-x-0 z-40 flex justify-center px-4"
          style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
        >
          <div
            className={cn(
              "w-full max-w-sm rounded-2xl border bg-card p-3 shadow-lg shadow-black/10",
              phase === "visible" && "animate-in slide-in-from-bottom-4 fade-in-0 zoom-in-95 duration-300",
              phase === "leaving" && "animate-out slide-out-to-bottom-4 fade-out-0 zoom-out-95 duration-300"
            )}
          >
            <div className="flex items-center justify-between px-1 pb-2">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <ShoppingCart className="size-4 text-primary" />
                {displayQty} item{displayQty !== 1 ? "s" : ""}
              </span>
              <span className="text-sm font-semibold">{formatCurrency(displayTotal, shop.currency)} Total</span>
            </div>
            <Button
              onClick={() => {
                setOrderSheetOpen(true);
                setHasOpenedCart(true);
              }}
              className="h-12 w-full justify-center bg-primary text-primary-foreground shadow-none hover:bg-primary/90"
            >
              {hasOpenedCart ? "View Cart" : "Add to Cart"} • {formatCurrency(displayTotal, shop.currency)}
            </Button>
          </div>
        </div>
      ) : null}

      <OrderSheet
        open={orderSheetOpen}
        onOpenChange={setOrderSheetOpen}
        items={cart.items}
        onSetQuantity={cart.setQuantity}
        onRemove={cart.removeItem}
        onOrderPlaced={() => {
          cart.clear();
        }}
        shop={shop}
        taxes={taxes}
        prefilledTable={prefilledTable}
        customer={customer}
        activeSession={activeSession}
      />
    </div>
  );
}
