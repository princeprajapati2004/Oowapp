"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import { toast } from "sonner";
import {
  ChefHat,
  ClipboardCheck,
  Plus,
  Minus,
  Receipt,
  Table2,
  Search,
  X,
  CheckCircle2,
  Clock,
  Utensils,
  ImageOff,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

type Product = {
  id: string;
  name: string;
  price: number;
  imageUrl: string | null;
  categoryId: string;
  categoryName: string;
  isAvailable: boolean;
  stock: number | null;
  foodType: string;
  offerNote: string | null;
  unit: string | null;
  createdAt: string;
};

type Tax = {
  id: string;
  name: string;
  type: string;
  value: number;
  appliesTo: string;
  categoryId: string | null;
};

type KotItem = {
  id: string;
  name: string;
  price: number;
  quantity: number;
  notes: string | null;
};

type KitchenTicket = {
  id: string;
  kotNumber: number;
  status: string;
  notes: string | null;
  createdAt: string;
  items: KotItem[];
};

type TableSession = {
  id: string;
  tableNumber: string;
  status: string;
  customerName: string | null;
  createdAt: string;
  kitchenTickets: KitchenTicket[];
};

type CartItem = {
  productId: string;
  name: string;
  price: number;
  quantity: number;
};

interface WaiterKotPanelProps {
  configuredTables: string[];
  products: Product[];
  taxes: Tax[];
  initialSessions: TableSession[];
  currency: string;
  showImages: boolean;
}

// ── KOT Status ────────────────────────────────────────────────────────────────

const KOT_STATUS_LABEL: Record<string, string> = {
  PENDING: "Waiting",
  PREPARING: "Preparing",
  READY: "Ready",
  SERVED: "Served",
  CANCELLED: "Cancelled",
};

const KOT_STATUS_COLOR: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  PREPARING: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  READY: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  SERVED: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  CANCELLED: "bg-muted text-muted-foreground",
};

// ── Component ─────────────────────────────────────────────────────────────────

export function WaiterKotPanel({
  configuredTables,
  products,
  taxes,
  initialSessions,
  currency,
  showImages,
}: WaiterKotPanelProps) {
  const [sessions, setSessions] = useState<TableSession[]>(initialSessions);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [kotNotes, setKotNotes] = useState("");
  const [search, setSearch] = useState("");
  const [sending, setSending] = useState(false);
  const [generatingBill, setGeneratingBill] = useState(false);
  const [view, setView] = useState<"tables" | "order">("tables");

  const activeSession = useMemo(
    () => sessions.find((s) => s.tableNumber === selectedTable) ?? null,
    [sessions, selectedTable]
  );

  const filteredProducts = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return products.filter((p) => p.isAvailable);
    return products.filter(
      (p) => p.isAvailable && (p.name.toLowerCase().includes(q) || p.categoryName.toLowerCase().includes(q))
    );
  }, [products, search]);

  // Group products by category
  const groupedProducts = useMemo(() => {
    const map = new Map<string, { name: string; items: Product[] }>();
    for (const p of filteredProducts) {
      if (!map.has(p.categoryId)) map.set(p.categoryId, { name: p.categoryName, items: [] });
      map.get(p.categoryId)!.items.push(p);
    }
    return Array.from(map.values());
  }, [filteredProducts]);

  function cartQty(productId: string) {
    return cart.find((i) => i.productId === productId)?.quantity ?? 0;
  }

  function updateCart(product: Product, delta: number) {
    setCart((prev) => {
      const existing = prev.find((i) => i.productId === product.id);
      if (!existing) {
        if (delta <= 0) return prev;
        return [...prev, { productId: product.id, name: product.name, price: product.price, quantity: delta }];
      }
      const newQty = existing.quantity + delta;
      if (newQty <= 0) return prev.filter((i) => i.productId !== product.id);
      return prev.map((i) => (i.productId === product.id ? { ...i, quantity: newQty } : i));
    });
  }

  const cartTotal = useMemo(() => cart.reduce((s, i) => s + i.price * i.quantity, 0), [cart]);

  async function handleSendToKitchen() {
    if (!selectedTable || cart.length === 0) return;
    setSending(true);
    try {
      const payload: Record<string, unknown> = {
        items: cart,
        notes: kotNotes.trim() || undefined,
      };
      // If we have a real session ID (not placeholder), use it; otherwise pass tableNumber
      if (activeSession && !activeSession.id.startsWith("pending-")) {
        payload.tableSessionId = activeSession.id;
      } else {
        payload.tableNumber = selectedTable;
      }

      const res = await api.post<{ kitchenTicketId: string; kotNumber: number; tableNumber: string; sessionId?: string }>(
        "/api/admin/kitchen-tickets",
        payload
      );

      const newTicket: KitchenTicket = {
        id: res.kitchenTicketId,
        kotNumber: res.kotNumber,
        status: "PENDING",
        notes: kotNotes.trim() || null,
        createdAt: new Date().toISOString(),
        items: cart.map((i) => ({ id: crypto.randomUUID(), ...i, notes: null })),
      };

      setSessions((prev) => {
        const sessionId = res.sessionId ?? activeSession?.id;
        const existingIdx = prev.findIndex((s) => s.id === sessionId || s.tableNumber === selectedTable);
        if (existingIdx >= 0) {
          return prev.map((s, i) =>
            i === existingIdx
              ? { ...s, id: sessionId ?? s.id, kitchenTickets: [...s.kitchenTickets, newTicket] }
              : s
          );
        }
        // Create a new session entry if it didn't exist yet
        return [...prev, {
          id: sessionId ?? `pending-${selectedTable}`,
          tableNumber: selectedTable,
          status: "ACTIVE",
          customerName: null,
          createdAt: new Date().toISOString(),
          kitchenTickets: [newTicket],
        }];
      });

      setCart([]);
      setKotNotes("");
      toast.success(`KOT #${res.kotNumber} sent to kitchen!`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to send to kitchen");
    } finally {
      setSending(false);
    }
  }

  async function handleOpenTable(tableNumber: string) {
    // If no session exists for this table, create one
    if (!sessions.find((s) => s.tableNumber === tableNumber)) {
      try {
        // Create a session by sending the first KOT (or just open via the table session API)
        // For now we'll show the order panel — the session is created on first KOT send
        const placeholderSession: TableSession = {
          id: `pending-${tableNumber}`,
          tableNumber,
          status: "ACTIVE",
          customerName: null,
          createdAt: new Date().toISOString(),
          kitchenTickets: [],
        };
        setSessions((prev) => [...prev, placeholderSession]);
      } catch {}
    }
    setSelectedTable(tableNumber);
    setCart([]);
    setView("order");
  }

  async function handleGenerateBill() {
    if (!activeSession || activeSession.id.startsWith("pending-")) {
      toast.error("No items have been sent to kitchen yet.");
      return;
    }
    setGeneratingBill(true);
    try {
      const res = await api.post<{ orderId: string; billNumber: string; grandTotal: number }>(
        `/api/admin/table-sessions/${activeSession.id}/generate-bill`,
        {}
      );
      toast.success(`Bill #${res.billNumber} generated — ${formatCurrency(res.grandTotal, currency)}`);
      setSessions((prev) =>
        prev.map((s) => (s.id === activeSession.id ? { ...s, status: "AWAITING_PAYMENT" } : s))
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to generate bill");
    } finally {
      setGeneratingBill(false);
    }
  }

  const allKotItems = useMemo(() => {
    if (!activeSession) return [];
    return activeSession.kitchenTickets
      .filter((k) => k.status !== "CANCELLED")
      .flatMap((k) => k.items);
  }, [activeSession]);

  const sessionTotal = useMemo(() => {
    return allKotItems.reduce((s, i) => s + i.price * i.quantity, 0);
  }, [allKotItems]);

  // ── Table List View ──────────────────────────────────────────────────────────

  if (view === "tables") {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-lg font-semibold">Waiter Panel</h1>
          <p className="text-sm text-muted-foreground">Select a table to take orders using KOT workflow.</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {configuredTables.map((table) => {
            const session = sessions.find((s) => s.tableNumber === table);
            const kotCount = session?.kitchenTickets.length ?? 0;
            const isAwaitingPayment = session?.status === "AWAITING_PAYMENT";
            return (
              <button
                key={table}
                onClick={() => handleOpenTable(table)}
                className={cn(
                  "flex flex-col items-center justify-center gap-1.5 rounded-xl border p-4 text-center transition-all hover:shadow-md",
                  session ? "border-primary/30 bg-primary/5" : "border-border bg-card hover:border-primary/20",
                  isAwaitingPayment && "border-violet-300 bg-violet-50 dark:bg-violet-900/10"
                )}
              >
                <Table2
                  className={cn(
                    "size-6",
                    session ? "text-primary" : "text-muted-foreground",
                    isAwaitingPayment && "text-violet-500"
                  )}
                />
                <span className="text-sm font-semibold">{table}</span>
                {session ? (
                  <span
                    className={cn(
                      "text-xs font-medium",
                      isAwaitingPayment ? "text-violet-600 dark:text-violet-400" : "text-primary"
                    )}
                  >
                    {isAwaitingPayment ? "Billing" : `${kotCount} KOT${kotCount === 1 ? "" : "s"}`}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">Available</span>
                )}
              </button>
            );
          })}
        </div>

        {configuredTables.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <Table2 className="size-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">No tables configured. Add tables in Settings.</p>
          </div>
        )}
      </div>
    );
  }

  // ── Order Panel View ─────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] gap-4 lg:flex-row">
      {/* Left: Product catalog */}
      <div className="flex-1 flex flex-col min-h-0 border rounded-xl bg-card overflow-hidden">
        <div className="flex items-center justify-between gap-3 p-3 border-b">
          <button
            onClick={() => { setView("tables"); setSelectedTable(null); setCart([]); }}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Tables
          </button>
          <span className="text-sm font-semibold">Table {selectedTable}</span>
          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
            {cart.length === 0 ? "Cart empty" : `${cart.reduce((s, i) => s + i.quantity, 0)} items`}
          </span>
        </div>

        {/* Search */}
        <div className="p-3 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search items…"
              className="pl-9 h-9 text-sm"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X className="size-4 text-muted-foreground hover:text-foreground" />
              </button>
            )}
          </div>
        </div>

        {/* Product list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {groupedProducts.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-8">No items found</p>
          )}
          {groupedProducts.map((group) => (
            <div key={group.name}>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                {group.name}
              </p>
              <div className="space-y-1">
                {group.items.map((product) => {
                  const qty = cartQty(product.id);
                  return (
                    <div
                      key={product.id}
                      className="flex items-center gap-3 rounded-lg p-2 hover:bg-muted/50 transition-colors"
                    >
                      {showImages && (
                        <div className="size-10 rounded-lg bg-muted shrink-0 overflow-hidden">
                          {product.imageUrl ? (
                            <Image
                              src={product.imageUrl}
                              alt={product.name}
                              width={40}
                              height={40}
                              className="object-cover w-full h-full"
                            />
                          ) : (
                            <div className="flex items-center justify-center h-full">
                              <ImageOff className="size-4 text-muted-foreground" />
                            </div>
                          )}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{product.name}</p>
                        <p className="text-xs text-muted-foreground">{formatCurrency(product.price, currency)}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {qty > 0 ? (
                          <>
                            <button
                              onClick={() => updateCart(product, -1)}
                              className="size-7 rounded-full border flex items-center justify-center hover:bg-muted transition-colors"
                            >
                              <Minus className="size-3.5" />
                            </button>
                            <span className="w-5 text-center text-sm font-semibold tabular-nums">{qty}</span>
                          </>
                        ) : null}
                        <button
                          onClick={() => updateCart(product, 1)}
                          className="size-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors"
                        >
                          <Plus className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right: Cart + KOT history + Bill */}
      <div className="w-full lg:w-80 flex flex-col gap-3 min-h-0">
        {/* Cart */}
        <div className="border rounded-xl bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-1.5">
              <Utensils className="size-4 text-primary" />
              Current Order
            </h3>
            {cart.length > 0 && (
              <button onClick={() => setCart([])} className="text-xs text-muted-foreground hover:text-destructive transition-colors">
                Clear
              </button>
            )}
          </div>

          {cart.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-3">Add items from the menu</p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {cart.map((item) => (
                <div key={item.productId} className="flex items-center gap-2 text-sm">
                  <span className="size-5 rounded bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">
                    {item.quantity}
                  </span>
                  <span className="flex-1 truncate">{item.name}</span>
                  <span className="text-muted-foreground shrink-0">
                    {formatCurrency(item.price * item.quantity, currency)}
                  </span>
                </div>
              ))}
              <div className="flex justify-between text-sm font-semibold border-t pt-2">
                <span>Total</span>
                <span>{formatCurrency(cartTotal, currency)}</span>
              </div>
            </div>
          )}

          {cart.length > 0 && (
            <Textarea
              value={kotNotes}
              onChange={(e) => setKotNotes(e.target.value)}
              placeholder="Notes for kitchen (optional)"
              className="text-xs h-16 resize-none"
            />
          )}

          <Button
            onClick={handleSendToKitchen}
            disabled={cart.length === 0 || sending || activeSession?.status === "AWAITING_PAYMENT"}
            className="w-full h-9 gap-1.5"
          >
            <ChefHat className="size-4" />
            {sending ? "Sending…" : "Send to Kitchen"}
          </Button>
        </div>

        {/* KOT History */}
        {activeSession && activeSession.kitchenTickets.length > 0 && (
          <div className="border rounded-xl bg-card p-4 space-y-2 flex-1 overflow-hidden flex flex-col">
            <h3 className="text-sm font-semibold flex items-center gap-1.5 shrink-0">
              <ClipboardCheck className="size-4 text-primary" />
              Kitchen Tickets
            </h3>
            <div className="flex-1 overflow-y-auto space-y-2">
              {[...activeSession.kitchenTickets].reverse().map((kot) => (
                <div key={kot.id} className="rounded-lg border p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground">KOT #{kot.kotNumber}</span>
                    <span className={cn("text-xs font-medium px-1.5 py-0.5 rounded-full", KOT_STATUS_COLOR[kot.status])}>
                      {KOT_STATUS_LABEL[kot.status]}
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    {kot.items.map((item) => (
                      <div key={item.id} className="flex gap-2 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{item.quantity}×</span>
                        <span>{item.name}</span>
                      </div>
                    ))}
                  </div>
                  {kot.notes && (
                    <p className="text-xs text-muted-foreground italic border-t pt-1.5">
                      <FileText className="size-3 inline mr-1" />
                      {kot.notes}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Session Summary + Generate Bill */}
        {activeSession && activeSession.kitchenTickets.length > 0 && (
          <div className="border rounded-xl bg-card p-4 space-y-3 shrink-0">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {allKotItems.reduce((s, i) => s + i.quantity, 0)} items total
              </span>
              <span className="font-semibold">{formatCurrency(sessionTotal, currency)}</span>
            </div>

            {activeSession.status === "AWAITING_PAYMENT" ? (
              <div className="flex items-center gap-2 text-sm text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20 rounded-lg p-2.5">
                <CheckCircle2 className="size-4 shrink-0" />
                Bill generated — awaiting payment
              </div>
            ) : (
              <Button
                variant="outline"
                onClick={handleGenerateBill}
                disabled={generatingBill || activeSession.id.startsWith("pending-")}
                className="w-full h-9 gap-1.5 border-primary text-primary hover:bg-primary/5"
              >
                <Receipt className="size-4" />
                {generatingBill ? "Generating…" : "Generate Final Bill"}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
