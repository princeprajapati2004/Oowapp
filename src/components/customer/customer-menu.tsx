"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, ShoppingCart, PackageSearch, History, LogIn, LogOut, Lock, AlertTriangle, Users, Wallet, Gift } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { InstallApp } from "@/components/shared/install-app";
import { ProductCard } from "@/components/customer/product-card";
import { useCart } from "@/lib/hooks/use-cart";
import { useTableSession } from "@/lib/hooks/use-table-session";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api-client";
import type {
  ActiveSession,
  CustomerCategory,
  CustomerProduct,
  CustomerShop,
} from "@/lib/types/customer";

// localStorage key for tracking which session this browser owns at a table.
export function tableSessionKey(shopSlug: string, tableNumber: string) {
  return `oowapp_table_${shopSlug}_${tableNumber}`;
}

function TableOccupiedScreen({ tableNumber, shopName }: { tableNumber: string; shopName: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/20 px-6 text-center">
      <div className="max-w-sm space-y-5">
        <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
          <AlertTriangle className="size-8 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Table Already Occupied</h1>
          <p className="text-muted-foreground">
            Table <span className="font-semibold text-foreground">#{tableNumber}</span> at{" "}
            <span className="font-semibold text-foreground">{shopName}</span> currently has an
            active order.
          </p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 px-4 py-3 text-sm text-amber-800 dark:text-amber-400">
          Please contact staff if you believe this is incorrect.
        </div>
      </div>
    </div>
  );
}

export function CustomerMenu({
  shop,
  categories,
  products,
  prefilledTable,
  customer,
  activeSession,
}: {
  shop: CustomerShop;
  categories: CustomerCategory[];
  products: CustomerProduct[];
  prefilledTable?: string;
  customer?: { name: string; phone: string } | null;
  activeSession?: ActiveSession;
}) {
  const router = useRouter();
  const cart = useCart(shop.slug);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");

  // The table session is owned here (not on the Current Order page) so the
  // sticky bottom panel always agrees on what's already been ordered even
  // right after navigating back from a fresh order there.
  const [session, setSession] = useState<ActiveSession>(activeSession ?? null);

  // Keeps the session live if staff mark the table as paid while the customer
  // still has the menu open — clears the cart and drops the session at that
  // point (nothing paid-related to preserve on this page — that view lives on
  // the Current Order page instead), since a paid session can never accept
  // more items (the next order from this table always starts a brand-new
  // session server-side).
  useTableSession(session, setSession, () => {
    toast.success("Payment confirmed — thank you!");
    cart.clear();
    setSession(null);
  });

  // ── Table occupancy ownership check ──────────────────────────────────────
  // null = still checking localStorage, true = owner or no table, false = blocked.
  // Only kicks in when there IS a prefilled table AND an active session.
  const needsOwnershipCheck = !!(prefilledTable && activeSession);
  const [isTableOwner, setIsTableOwner] = useState<boolean | null>(needsOwnershipCheck ? null : true);

  useEffect(() => {
    if (!needsOwnershipCheck) return;
    try {
      const stored = localStorage.getItem(tableSessionKey(shop.slug, prefilledTable!));
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsTableOwner(stored === activeSession!.id);
    } catch {
      setIsTableOwner(true); // fail open on storage errors
    }
    // activeSession.id and prefilledTable are stable for a given page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsOwnershipCheck, shop.slug]);

  // ── Locked quantities ─────────────────────────────────────────────────────
  // Maps productId → total quantity already committed to the restaurant for
  // this session. The cart stepper shows effective total (locked + new); new
  // items can be added but committed quantities can never be reduced.
  const lockedQuantities = useMemo(() => {
    const map = new Map<string, number>();
    if (!session) return map;
    session.orders
      .filter((o) => o.status !== "CANCELLED")
      .flatMap((o) => o.items)
      .forEach((item) => {
        if (!item.productId) return;
        map.set(item.productId, (map.get(item.productId) ?? 0) + item.quantity);
      });
    return map;
  }, [session]);

  const hasLockedItems = lockedQuantities.size > 0;

  // Drives the sticky bottom panel's mount/unmount so it can slide+fade+scale
  // out smoothly instead of vanishing the instant the cart empties — plain
  // conditional rendering has no exit transition, so the panel stays mounted
  // through a "leaving" phase (via the render-phase state adjustment below,
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes)
  // before a single effect unmounts it once the exit animation finishes.
  // A returning customer with items already ordered on this table (but nothing
  // new in their local cart yet) still needs a way to reach the Current Order
  // page, so the panel isn't gated on the local cart alone.
  const hasOpenSessionItems = (session?.orders.filter((o) => o.status !== "CANCELLED").length ?? 0) > 0;
  const cartHasItems = cart.totalQuantity > 0;
  const hasItems = cartHasItems || hasOpenSessionItems;
  const [phase, setPhase] = useState<"hidden" | "visible" | "leaving">(hasItems ? "visible" : "hidden");
  const [prevHasItems, setPrevHasItems] = useState(hasItems);

  if (hasItems !== prevHasItems) {
    setPrevHasItems(hasItems);
    setPhase(hasItems ? "visible" : "leaving");
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

  // ── Cart quantity helpers ─────────────────────────────────────────────────
  // effectiveQty = locked (already ordered) + new (in cart). This is what the
  // product card stepper shows. Decrement is blocked once it would go below
  // the locked floor.
  function effectiveQty(productId: string) {
    return (lockedQuantities.get(productId) ?? 0) + cart.quantityOf(productId);
  }

  function handleQuantityChange(product: CustomerProduct, quantity: number) {
    const lockedQty = lockedQuantities.get(product.id) ?? 0;
    if (quantity < lockedQty) {
      toast.error("This item has already been sent to the kitchen and cannot be removed.");
      return;
    }
    const newCartQty = quantity - lockedQty;
    if (newCartQty === 0) {
      cart.setQuantity(product.id, 0);
    } else if (cart.quantityOf(product.id) === 0 && newCartQty > 0) {
      cart.addItem(
        {
          productId: product.id,
          name: product.name,
          price: product.price,
          categoryId: product.categoryId,
          imageUrl: product.imageUrl,
        },
        newCartQty
      );
    } else {
      cart.setQuantity(product.id, newCartQty);
    }
  }

  // Snapshot of last non-empty cart for the sticky panel exit animation.
  const subtotal = cart.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const [displayTotals, setDisplayTotals] = useState({ qty: cart.totalQuantity, total: subtotal });
  if (hasItems && (displayTotals.qty !== cart.totalQuantity || displayTotals.total !== subtotal)) {
    setDisplayTotals({ qty: cart.totalQuantity, total: subtotal });
  }
  const displayQty = displayTotals.qty;
  const displayTotal = displayTotals.total;

  async function handleLogout() {
    await api.post("/api/customer/auth/logout");
    router.refresh();
  }

  // ── QR ordering disabled screen ───────────────────────────────────────────
  if (shop.enableQrOrdering === false) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-muted/20 px-6 text-center">
        <div className="max-w-sm space-y-5">
          <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-muted">
            <Users className="size-8 text-muted-foreground" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">Orders via Staff Only</h1>
            <p className="text-muted-foreground">
              This store currently accepts orders through staff only. Please ask a staff member to take your order.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Table occupied screen ─────────────────────────────────────────────────
  // Show after localStorage hydration confirms this browser doesn't own the session.
  if (isTableOwner === false && activeSession) {
    return <TableOccupiedScreen tableNumber={prefilledTable!} shopName={shop.businessName} />;
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
          {prefilledTable && (
            <span className="shrink-0 rounded-full border border-[#00b074] bg-[#e6f7f1] px-3 py-1 text-xs font-bold text-[#00b074] dark:bg-[#00b074]/10">
              Table #{prefilledTable}
            </span>
          )}
          <Button variant="ghost" size="icon" aria-label="Your orders" render={<Link href={`/order/${shop.slug}/orders`} />} nativeButton={false}>
            <History className="size-4.5" />
          </Button>
          {customer && (
            <Button variant="ghost" size="icon" aria-label="Your wallet" render={<Link href={`/order/${shop.slug}/wallet`} />} nativeButton={false}>
              <Wallet className="size-4.5" />
            </Button>
          )}
          {customer && (
            <Button variant="ghost" size="icon" aria-label="Refer & earn" render={<Link href={`/order/${shop.slug}/refer`} />} nativeButton={false}>
              <Gift className="size-4.5" />
            </Button>
          )}
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

      <main className="mx-auto max-w-3xl px-4 py-5 space-y-4">
        {hasLockedItems && (
          <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 px-4 py-3 text-sm text-amber-800 dark:text-amber-400">
            <Lock className="size-4 mt-0.5 shrink-0" />
            <p>
              Order already booked. Previously ordered items cannot be removed. You can add more items or increase quantities.
            </p>
          </div>
        )}

        {filtered.length === 0 ? (
          <EmptyState
            icon={PackageSearch}
            title="No items found"
            description="Try a different search or category."
          />
        ) : (
          <div className={cn(
            "gap-3",
            shop.showProductImages ?? true
              ? "grid grid-cols-2 sm:grid-cols-3"
              : "flex flex-col"
          )}>
            {filtered.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                currency={shop.currency}
                quantityInCart={effectiveQty(product.id)}
                minQuantity={lockedQuantities.get(product.id) ?? 0}
                onQuantityChange={(quantity) => handleQuantityChange(product, quantity)}
                showImages={shop.showProductImages ?? true}
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
                {cartHasItems ? `${displayQty} item${displayQty !== 1 ? "s" : ""}` : "Your table"}
              </span>
              {cartHasItems && (
                <span className="text-sm font-semibold">{formatCurrency(displayTotal, shop.currency)} Total</span>
              )}
            </div>
            <Button
              className="h-12 w-full justify-center bg-primary text-primary-foreground shadow-none hover:bg-primary/90"
              render={
                <Link
                  href={`/order/${shop.slug}/bill${prefilledTable ? `?table=${encodeURIComponent(prefilledTable)}` : ""}`}
                />
              }
              nativeButton={false}
            >
              {cartHasItems ? `View Cart • ${formatCurrency(displayTotal, shop.currency)}` : "View Your Bill"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
