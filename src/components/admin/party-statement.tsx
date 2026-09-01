"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  Download,
  Printer,
  Share2,
  Plus,
  Phone,
  Building2,
  MapPin,
  Receipt,
  ShoppingBag,
  ArrowDownCircle,
  ArrowUpCircle,
  Pencil,
  MessageCircle,
  Trash2,
  CreditCard,
  StickyNote,
  X,
  Filter,
  MoreVertical,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { FormRow } from "@/components/shared/form-row";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { PartyFormDialog } from "@/components/admin/party-form-dialog";
import { RevenueChart } from "@/components/admin/dashboard/revenue-chart";
import { api, ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils";
import type { getPartyStatement } from "@/lib/services/party";
import type { RevenuePoint } from "@/lib/services/analytics";

function waLink(phone: string) {
  return `https://wa.me/${phone.replace(/[^\d]/g, "")}`;
}

type Statement = Awaited<ReturnType<typeof getPartyStatement>>;

type Period = "all" | "today" | "yesterday" | "week" | "month" | "year" | "custom";

const PERIODS: { value: Period; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "year", label: "This year" },
  { value: "custom", label: "Custom date" },
];

const PERIOD_DAYS: Record<"week" | "month" | "year", number> = { week: 7, month: 30, year: 365 };

const METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  UPI: "UPI",
  CARD: "Card",
  BANK_TRANSFER: "Bank transfer",
  OTHER: "Other",
};

// Real payment status/amount, never the free-text paymentMethod field — see
// the matching fix in lib/services/party.ts for why the old
// paymentMethod-based check was wrong for partially-paid orders.
function orderPaymentBadge(paymentStatus: string | null): "unpaid" | "partial" | "paid" {
  if (paymentStatus === "PARTIALLY_PAID") return "partial";
  if (paymentStatus === "PAID") return "paid";
  return "unpaid";
}

type EntryStatus = "unpaid" | "partial" | "paid" | "received" | "paidOut";

// Icon color reflects the transaction TYPE (green = sale, blue/gray = payment
// direction); the badge reflects its STATUS — the two are independent, so an
// unpaid order still gets the green shopping-bag icon, just an orange badge.
const STATUS_STYLES: Record<EntryStatus, { badgeLabel: string; badgeClass: string; icon: typeof ShoppingBag; iconClass: string }> = {
  unpaid: {
    badgeLabel: "Unpaid",
    badgeClass: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400",
    icon: ShoppingBag,
    iconClass: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400",
  },
  partial: {
    badgeLabel: "Partial",
    badgeClass: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
    icon: ShoppingBag,
    iconClass: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400",
  },
  paid: {
    badgeLabel: "Paid",
    badgeClass: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
    icon: ShoppingBag,
    iconClass: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400",
  },
  received: {
    badgeLabel: "Received",
    badgeClass: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
    icon: ArrowDownCircle,
    iconClass: "bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400",
  },
  paidOut: {
    badgeLabel: "Paid out",
    badgeClass: "bg-muted text-muted-foreground",
    icon: ArrowUpCircle,
    iconClass: "bg-muted text-muted-foreground",
  },
};

function outstandingClass(outstanding: number) {
  if (outstanding > 0) return "text-red-600 dark:text-red-400";
  if (outstanding < 0) return "text-emerald-600 dark:text-emerald-400";
  return "text-foreground";
}

export function PartyStatement({
  initialStatement,
  shop,
}: {
  initialStatement: Statement;
  shop: {
    businessName: string;
    logoUrl: string | null;
    address: string | null;
    phone: string | null;
    gstNumber: string | null;
    currency: string;
  };
}) {
  const router = useRouter();
  const [statement, setStatement] = useState(initialStatement);
  const [period, setPeriod] = useState<Period>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  // Date.now() can't be read during render (React purity rule) — captured
  // once on mount instead, same pattern as catalogLoadedAt in create-order-page.tsx.
  const [nowMs, setNowMs] = useState(0);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setNowMs(Date.now()), []);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<"RECEIVED" | "PAID">(
    statement.party.type === "SUPPLIER" ? "PAID" : "RECEIVED"
  );
  const [method, setMethod] = useState<"CASH" | "UPI" | "CARD" | "BANK_TRANSFER" | "OTHER">("CASH");
  const [note, setNote] = useState("");
  const [discount, setDiscount] = useState("");
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const { party } = statement;

  // Oldest first (FIFO default) — same order the backend allocates in.
  const outstandingOrders = useMemo(
    () =>
      statement.orders
        .filter((o) => o.status !== "CANCELLED" && (o.paymentStatus === "PENDING" || o.paymentStatus === "PARTIALLY_PAID"))
        .slice()
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [statement.orders]
  );

  // Every outstanding order starts selected exactly when the dialog
  // transitions to open — "FIFO across everything" is the default, the
  // owner can uncheck specific invoices. "Adjusting state when a prop
  // changes" during render, same pattern OrderPaymentModal/OrderEditModal
  // already use, rather than an effect.
  const [wasLogOpen, setWasLogOpen] = useState(logOpen);
  if (logOpen !== wasLogOpen) {
    setWasLogOpen(logOpen);
    if (logOpen) setSelectedOrderIds(new Set(outstandingOrders.map((o) => o.id)));
  }

  function toggleOrderSelected(orderId: string) {
    setSelectedOrderIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  }

  // Client-side preview only — mirrors settlePartyPayment's exact cash-then-
  // discount, oldest-first logic so what the owner sees here matches what
  // actually gets saved. The server recomputes authoritatively regardless.
  const allocationPreview = useMemo(() => {
    const amountNum = Number(amount) || 0;
    const discountNum = Number(discount) || 0;
    const selected = outstandingOrders.filter((o) => selectedOrderIds.has(o.id));
    type Row = { order: (typeof outstandingOrders)[number]; cashPortion: number; discountPortion: number; newOutstanding: number };
    const initial: { remainingCash: number; remainingDiscount: number; rows: Row[] } = {
      remainingCash: amountNum,
      remainingDiscount: discountNum,
      rows: [],
    };
    return selected.reduce((acc, o) => {
      const outstanding = o.outstanding ?? 0;
      const cashPortion = acc.remainingCash > 0.005 ? Math.min(acc.remainingCash, outstanding) : 0;
      const discountPortion = acc.remainingDiscount > 0.005 ? Math.min(acc.remainingDiscount, outstanding - cashPortion) : 0;
      const newOutstanding = Math.max(0, outstanding - cashPortion - discountPortion);
      return {
        remainingCash: acc.remainingCash - cashPortion,
        remainingDiscount: acc.remainingDiscount - discountPortion,
        rows: [...acc.rows, { order: o, cashPortion, discountPortion, newOutstanding }],
      };
    }, initial).rows;
  }, [outstandingOrders, selectedOrderIds, amount, discount]);
  const totalSelectedOutstanding = allocationPreview.reduce((s, a) => s + (a.order.outstanding ?? 0), 0);

  const timeline = useMemo(() => {
    type Entry = {
      id: string;
      date: string;
      kind: "order" | "payment";
      label: string;
      amount: number;
      status: EntryStatus;
      href?: string;
    };
    const orderEntries: Entry[] = statement.orders.map((o) => ({
      id: `order-${o.id}`,
      date: o.createdAt,
      kind: "order",
      label: `Order #${o.billNumber} · ${o.itemCount} item${o.itemCount !== 1 ? "s" : ""}`,
      amount: o.discountedTotal ?? o.grandTotal,
      status: orderPaymentBadge(o.paymentStatus),
      href: `/admin/orders/${o.id}`,
    }));
    const paymentEntries: Entry[] = statement.payments.map((p) => ({
      id: `payment-${p.id}`,
      date: p.createdAt,
      kind: "payment",
      label: `${p.direction === "RECEIVED" ? "Received" : "Paid"} via ${METHOD_LABELS[p.method] ?? p.method}${p.note ? ` — ${p.note}` : ""}`,
      amount: p.amount,
      status: p.direction === "RECEIVED" ? "received" : "paidOut",
    }));
    const merged = [...orderEntries, ...paymentEntries].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    if (period === "all" || nowMs === 0) return merged;

    if (period === "today" || period === "yesterday") {
      const start = new Date(nowMs);
      start.setHours(0, 0, 0, 0);
      if (period === "yesterday") start.setDate(start.getDate() - 1);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      return merged.filter((e) => {
        const t = new Date(e.date).getTime();
        return t >= start.getTime() && t < end.getTime();
      });
    }

    if (period === "custom") {
      if (!customFrom && !customTo) return merged;
      const fromMs = customFrom ? new Date(`${customFrom}T00:00:00`).getTime() : -Infinity;
      const toMs = customTo ? new Date(`${customTo}T23:59:59.999`).getTime() : Infinity;
      return merged.filter((e) => {
        const t = new Date(e.date).getTime();
        return t >= fromMs && t <= toMs;
      });
    }

    const cutoff = nowMs - PERIOD_DAYS[period] * 24 * 60 * 60 * 1000;
    return merged.filter((e) => new Date(e.date).getTime() >= cutoff);
  }, [statement, period, nowMs, customFrom, customTo]);

  // Monthly totals for the last 6 calendar months (oldest first), reusing the
  // dashboard's RevenueChart — spending here means orders only, not payments.
  const monthlyChart = useMemo<RevenuePoint[]>(() => {
    const months: { key: string; label: string }[] = [];
    const cursor = new Date();
    cursor.setDate(1);
    for (let i = 5; i >= 0; i--) {
      const d = new Date(cursor.getFullYear(), cursor.getMonth() - i, 1);
      months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString(undefined, { month: "short" }) });
    }
    const buckets = new Map<string, { revenue: number; orders: number }>();
    for (const m of months) buckets.set(m.key, { revenue: 0, orders: 0 });
    for (const order of statement.orders) {
      const d = new Date(order.createdAt);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const bucket = buckets.get(key);
      if (!bucket) continue;
      bucket.revenue += order.discountedTotal ?? order.grandTotal;
      bucket.orders += 1;
    }
    return months.map((m) => ({ label: m.label, revenue: buckets.get(m.key)!.revenue, orders: buckets.get(m.key)!.orders }));
  }, [statement.orders]);
  const hasChartData = monthlyChart.some((p) => p.orders > 0);

  async function refresh() {
    const refreshed = await api.get<Statement>(`/api/admin/parties/${party.id}`);
    setStatement(refreshed);
  }

  async function handleDeleteParty() {
    try {
      await api.delete(`/api/admin/parties/${party.id}`);
      toast.success("Party deleted");
      router.push("/admin/parties");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to delete");
    } finally {
      setDeleteOpen(false);
    }
  }

  async function handleLogPayment() {
    const num = Number(amount);
    if (!Number.isFinite(num) || num <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    const discountNum = Number(discount) || 0;
    const settlingOrders = direction === "RECEIVED" && allocationPreview.length > 0;
    if (settlingOrders && num + discountNum > totalSelectedOutstanding + 0.005) {
      toast.error(`Payment plus discount can't exceed the selected invoices' outstanding total (${formatCurrency(totalSelectedOutstanding, shop.currency)})`);
      return;
    }
    setSaving(true);
    try {
      await api.post(`/api/admin/parties/${party.id}/payments`, {
        amount: num,
        method,
        direction,
        note,
        ...(settlingOrders
          ? { discount: discountNum > 0 ? discountNum : undefined, orderIds: allocationPreview.map((a) => a.order.id) }
          : {}),
      });
      await refresh();
      toast.success(settlingOrders ? `Payment logged — ${allocationPreview.length} invoice(s) updated` : "Payment logged");
      setLogOpen(false);
      setAmount("");
      setNote("");
      setDiscount("");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to log payment");
    } finally {
      setSaving(false);
    }
  }

  async function handleShare() {
    const summary = `${party.name} — ${shop.businessName}\nOutstanding: ${formatCurrency(statement.summary.outstanding, shop.currency)}`;
    setSharing(true);
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: `${party.name} — Statement`, text: summary });
      } else if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(summary);
        toast.success("Statement summary copied to clipboard");
      }
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") {
        toast.error("Couldn't share the statement");
      }
    } finally {
      setSharing(false);
    }
  }

  async function handleDownloadPdf() {
    setDownloadingPdf(true);
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const pageW = doc.internal.pageSize.getWidth();
      const margin = 48;
      const contentW = pageW - margin * 2;
      let y = margin;

      if (shop.logoUrl) {
        try {
          const resp = await fetch(shop.logoUrl);
          const blob = await resp.blob();
          const dataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
          const logoSize = 52;
          doc.addImage(dataUrl, "WEBP", (pageW - logoSize) / 2, y, logoSize, logoSize);
          y += logoSize + 10;
        } catch {
          // skip logo_1 on error
        }
      }

      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(20, 20, 20);
      doc.text(shop.businessName, pageW / 2, y, { align: "center" });
      y += 20;

      doc.setFontSize(8.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 100, 100);
      if (shop.address) {
        doc.text(shop.address, pageW / 2, y, { align: "center" });
        y += 12;
      }
      if (shop.gstNumber) {
        doc.text(`GSTIN: ${shop.gstNumber}`, pageW / 2, y, { align: "center" });
        y += 12;
      }
      y += 8;

      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(20, 20, 20);
      doc.text("PARTY STATEMENT", pageW / 2, y, { align: "center" });
      y += 16;
      doc.setDrawColor(200, 200, 200);
      doc.line(margin, y, pageW - margin, y);
      y += 14;

      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(20, 20, 20);
      doc.text(party.name, margin, y);
      doc.text(`Generated: ${new Date().toLocaleDateString()}`, pageW - margin, y, { align: "right" });
      y += 13;
      doc.setFont("helvetica", "normal");
      doc.setTextColor(80, 80, 80);
      doc.text(`${party.type === "CUSTOMER" ? "Customer" : "Supplier"} · ${party.phone}`, margin, y);
      y += 12;
      if (party.businessName) { doc.text(party.businessName, margin, y); y += 12; }
      if (party.gstNumber) { doc.text(`GST: ${party.gstNumber}`, margin, y); y += 12; }
      y += 8;

      doc.setDrawColor(200, 200, 200);
      doc.line(margin, y, pageW - margin, y);
      y += 14;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      const col = { date: margin, desc: margin + 70, amount: pageW - margin };
      doc.text("Date", col.date, y);
      doc.text("Description", col.desc, y);
      doc.text("Amount", col.amount, y, { align: "right" });
      y += 5;
      doc.setDrawColor(200, 200, 200);
      doc.line(margin, y, pageW - margin, y);
      y += 10;

      doc.setFont("helvetica", "normal");
      doc.setTextColor(40, 40, 40);
      for (const entry of timeline) {
        if (y > 760) {
          doc.addPage();
          y = margin;
        }
        const dateStr = new Date(entry.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
        const descLines = doc.splitTextToSize(entry.label, contentW - 140);
        doc.text(dateStr, col.date, y);
        doc.text(descLines, col.desc, y);
        doc.text(formatCurrency(entry.amount, shop.currency), col.amount, y, { align: "right" });
        y += Math.max(descLines.length * 11, 13);
      }

      y += 6;
      doc.setDrawColor(200, 200, 200);
      doc.line(margin, y, pageW - margin, y);
      y += 16;

      function totalRow(label: string, value: string, bold = false) {
        doc.setFont("helvetica", bold ? "bold" : "normal");
        doc.setFontSize(bold ? 10.5 : 9);
        doc.setTextColor(bold ? 20 : 80, bold ? 20 : 80, bold ? 20 : 80);
        doc.text(label, pageW - margin - 170, y);
        doc.text(value, pageW - margin, y, { align: "right" });
        y += bold ? 16 : 13;
      }
      totalRow("Orders", String(statement.summary.orderCount));
      totalRow("Paid", formatCurrency(statement.summary.totalPaid, shop.currency));
      totalRow("Outstanding", formatCurrency(statement.summary.outstanding, shop.currency), true);

      doc.save(`statement-${party.name.replace(/\s+/g, "-").toLowerCase()}.pdf`);
      toast.success("Statement downloaded");
    } catch {
      toast.error("Couldn't generate the PDF — please try again.");
    } finally {
      setDownloadingPdf(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-6 print:max-w-none print:space-y-3">
      <div className="flex items-center gap-3 print:hidden">
        <Button variant="ghost" size="icon" className="shrink-0" render={<Link href="/admin/parties" />} nativeButton={false}>
          <ArrowLeft className="size-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold truncate">{party.name}</h1>
          <p className="text-sm text-muted-foreground">
            {party.type === "CUSTOMER" ? "Customer" : "Supplier"} statement
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 print:hidden">
        <Button className="h-10 flex-1 gap-1.5 sm:flex-none" onClick={() => setLogOpen(true)}>
          <Plus className="size-4" /> Log Payment
        </Button>

        <Popover>
          <PopoverTrigger
            render={
              <Button
                variant="outline"
                size="icon"
                aria-label="Filter by date"
                className="relative h-10 w-10 shrink-0"
              />
            }
          >
            <Filter className="size-4" />
            {period !== "all" && (
              <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-primary ring-2 ring-background" />
            )}
          </PopoverTrigger>
          <PopoverContent className="w-56" align="end">
            <div className="space-y-0.5">
              {PERIODS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPeriod(p.value)}
                  className={cn(
                    "w-full rounded-md px-2.5 py-1.5 text-left text-sm font-medium transition-colors",
                    period === p.value ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {period === "custom" && (
              <div className="mt-2 grid grid-cols-2 gap-2 border-t pt-2.5">
                <FormRow label="From" htmlFor="statement-from">
                  <Input id="statement-from" type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-8 text-xs" />
                </FormRow>
                <FormRow label="To" htmlFor="statement-to">
                  <Input id="statement-to" type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-8 text-xs" />
                </FormRow>
              </div>
            )}
          </PopoverContent>
        </Popover>

        <DropdownMenu>
          <DropdownMenuTrigger className={cn(buttonVariants({ variant: "outline", size: "icon" }), "h-10 w-10 shrink-0")} aria-label="More actions">
            <MoreVertical className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem render={<a href={`tel:${party.phone}`} />}>
              <Phone className="size-4" /> Call
            </DropdownMenuItem>
            <DropdownMenuItem render={<a href={waLink(party.phone)} target="_blank" rel="noopener noreferrer" />}>
              <MessageCircle className="size-4" /> WhatsApp
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setEditOpen(true)}>
              <Pencil className="size-4" /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => window.print()}>
              <Printer className="size-4" /> Print
            </DropdownMenuItem>
            <DropdownMenuItem disabled={sharing} onClick={handleShare}>
              <Share2 className="size-4" /> {sharing ? "Sharing…" : "Share"}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={downloadingPdf} onClick={handleDownloadPdf}>
              <Download className="size-4" /> {downloadingPdf ? "Generating…" : "Export PDF"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="size-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Party info card */}
      <div className="rounded-2xl border bg-card overflow-hidden print:rounded-none print:border-0">
        <div className="px-5 py-4 border-b bg-muted/30 flex items-start justify-between gap-2 flex-wrap">
          <div className="space-y-1.5 text-sm">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Phone className="size-3.5" /> {party.phone}
              </span>
              {party.address && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="size-3.5" /> {party.address}
                </span>
              )}
            </div>
            {party.businessName && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Building2 className="size-3.5" /> {party.businessName}
              </div>
            )}
            {party.gstNumber && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Receipt className="size-3.5" /> GST: {party.gstNumber}
              </div>
            )}
            {party.creditLimit !== null && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <CreditCard className="size-3.5" /> Credit limit: {formatCurrency(party.creditLimit, shop.currency)}
              </div>
            )}
            {party.notes && (
              <div className="flex items-start gap-2 text-muted-foreground">
                <StickyNote className="size-3.5 shrink-0 mt-0.5" /> <span>{party.notes}</span>
              </div>
            )}
          </div>
          <Badge
            className={cn(
              "border-0 text-xs font-semibold shrink-0",
              party.category === "VIP"
                ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"
                : "bg-secondary text-secondary-foreground"
            )}
          >
            {party.category === "VIP" ? "VIP" : party.category.charAt(0) + party.category.slice(1).toLowerCase()}
          </Badge>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-3 divide-x">
          <div className="px-4 py-4 text-center">
            <p className={cn("text-lg font-bold tabular-nums", outstandingClass(statement.summary.outstanding))}>
              {formatCurrency(statement.summary.outstanding, shop.currency)}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Outstanding</p>
          </div>
          <div className="px-4 py-4 text-center">
            <p className="text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
              {formatCurrency(statement.summary.totalPaid, shop.currency)}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Paid</p>
          </div>
          <div className="px-4 py-4 text-center">
            <p className="text-lg font-bold tabular-nums">
              {party.type === "SUPPLIER" ? statement.summary.purchaseCount : statement.summary.orderCount}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{party.type === "SUPPLIER" ? "Purchases" : "Orders"}</p>
          </div>
        </div>
        {party.type === "SUPPLIER" && statement.summary.totalPurchases > 0 && (
          <div className="border-t px-4 py-2.5 text-center text-xs text-muted-foreground">
            Total Purchases: <span className="font-semibold text-foreground">{formatCurrency(statement.summary.totalPurchases, shop.currency)}</span>
          </div>
        )}
      </div>

      {/* Monthly spending chart */}
      {hasChartData && (
        <div className="rounded-xl border bg-card p-4 print:hidden">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Monthly Spending</p>
          <RevenueChart data={monthlyChart} granularity="month" currency={shop.currency} />
        </div>
      )}

      {/* Purchase history (suppliers only) */}
      {statement.purchases.length > 0 && (
        <div className="rounded-xl border overflow-hidden print:hidden">
          <div className="bg-muted/30 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Purchase History
          </div>
          <div className="divide-y">
            {statement.purchases.map((p) => (
              <Link
                key={p.id}
                href={`/admin/purchases/${p.id}`}
                className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-muted/40 transition-colors"
              >
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
                  <ShoppingBag className="size-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{p.purchaseNumber}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(p.purchaseDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                    {p.status === "CANCELLED" ? " · Cancelled" : ""}
                  </p>
                </div>
                <div className="text-right shrink-0 space-y-1">
                  <p className="font-semibold tabular-nums">{formatCurrency(p.grandTotal, shop.currency)}</p>
                  <Badge
                    className={cn(
                      "border-0 font-semibold",
                      p.status === "CANCELLED"
                        ? "bg-secondary text-secondary-foreground"
                        : p.paymentStatus === "PAID"
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                          : p.paymentStatus === "PARTIALLY_PAID"
                            ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"
                            : "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400"
                    )}
                  >
                    {p.status === "CANCELLED" ? "Cancelled" : p.paymentStatus === "PAID" ? "Paid" : p.paymentStatus === "PARTIALLY_PAID" ? "Partially Paid" : "Pending"}
                  </Badge>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Activity & transactions timeline */}
      <div className="rounded-xl border overflow-hidden">
        <div className="bg-muted/30 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Activity &amp; Transactions
        </div>
        {timeline.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground text-center">No activity in this period.</p>
        ) : (
          <div className="divide-y">
            {timeline.map((entry) => {
              const style = STATUS_STYLES[entry.status];
              const EntryIcon = style.icon;
              const content = (
                <div className="flex items-center gap-3 px-4 py-3 text-sm">
                  <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", style.iconClass)}>
                    <EntryIcon className="size-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{entry.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(entry.date).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  <div className="text-right shrink-0 space-y-1">
                    <p className="font-semibold tabular-nums">{formatCurrency(entry.amount, shop.currency)}</p>
                    <Badge className={cn("border-0 font-semibold", style.badgeClass)}>{style.badgeLabel}</Badge>
                  </div>
                </div>
              );
              return entry.href ? (
                <Link key={entry.id} href={entry.href} className="block hover:bg-muted/40 transition-colors">
                  {content}
                </Link>
              ) : (
                <div key={entry.id}>{content}</div>
              );
            })}
          </div>
        )}
      </div>

      {/* Log Payment dialog — full-screen bottom sheet on mobile, centered dialog on sm+ */}
      <Dialog open={logOpen} onOpenChange={setLogOpen}>
        <DialogContent
          showCloseButton={false}
          className={cn(
            "flex flex-col gap-0 overflow-hidden overscroll-contain p-0",
            "top-auto right-0 bottom-0 left-0 h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 rounded-t-[24px] rounded-b-none",
            "duration-300 data-open:zoom-in-100 data-open:slide-in-from-bottom data-closed:zoom-out-100 data-closed:slide-out-to-bottom",
            "sm:top-1/2 sm:right-auto sm:bottom-auto sm:left-1/2 sm:h-auto sm:max-h-[85vh] sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl"
          )}
        >
          {/* Sticky header */}
          <div className="pt-safe flex shrink-0 items-center gap-1 border-b px-4 py-3.5">
            <Button variant="ghost" size="icon" onClick={() => setLogOpen(false)} aria-label="Back" className="sm:hidden">
              <ArrowLeft className="size-5" />
            </Button>
            <DialogTitle className="min-w-0 flex-1 truncate text-base font-semibold">
              Log Payment — {party.name}
            </DialogTitle>
            <Button variant="ghost" size="icon" onClick={() => setLogOpen(false)} aria-label="Close">
              <X className="size-5" />
            </Button>
          </div>

          {/* Scrollable body — the only part that scrolls; header/footer stay pinned */}
          <div className="flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-5">
            <div className="flex h-[52px] overflow-hidden rounded-xl border text-sm">
              {(["RECEIVED", "PAID"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDirection(d)}
                  className={cn(
                    "flex-1 px-4 font-medium transition-colors",
                    direction === d ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  {d === "RECEIVED" ? "Received" : "Paid out"}
                </button>
              ))}
            </div>
            <FormRow label="Amount" htmlFor="payment-amount" required>
              <Input
                id="payment-amount"
                type="number"
                step="0.01"
                min={0}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                autoFocus
                className="h-[52px] rounded-xl px-4 text-base"
              />
            </FormRow>

            {direction === "RECEIVED" && outstandingOrders.length > 0 && (
              <>
                <div className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <p className="text-sm font-medium">Settle outstanding invoices</p>
                    <span className="text-xs text-muted-foreground">
                      {formatCurrency(totalSelectedOutstanding, shop.currency)} selected
                    </span>
                  </div>
                  <p className="px-1 text-xs text-muted-foreground">
                    Settle outstanding invoices with the payment above — oldest first by default, uncheck any you don&apos;t want this payment applied to.
                  </p>
                  <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-xl border p-2">
                    {outstandingOrders.map((o) => {
                      const preview = allocationPreview.find((a) => a.order.id === o.id);
                      const checked = selectedOrderIds.has(o.id);
                      return (
                        <label
                          key={o.id}
                          className={cn(
                            "flex cursor-pointer items-center gap-2.5 rounded-lg border px-2.5 py-2 text-sm transition-colors",
                            checked ? "border-primary/40 bg-primary/5" : "hover:bg-muted/40"
                          )}
                        >
                          <Checkbox checked={checked} onCheckedChange={() => toggleOrderSelected(o.id)} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">#{o.billNumber}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(o.createdAt).toLocaleDateString()} · Outstanding {formatCurrency(o.outstanding ?? 0, shop.currency)}
                            </p>
                          </div>
                          {checked && preview && (preview.cashPortion > 0.005 || preview.discountPortion > 0.005) && (
                            <span className={cn("shrink-0 text-xs font-semibold", preview.newOutstanding <= 0.005 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400")}>
                              {preview.newOutstanding <= 0.005 ? "Fully paid" : `${formatCurrency(preview.newOutstanding, shop.currency)} left`}
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </div>
                <FormRow label="Discount" htmlFor="payment-discount" description="Optional — recorded separately, not folded into the amount">
                  <Input
                    id="payment-discount"
                    type="number"
                    step="0.01"
                    min={0}
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value)}
                    className="h-[52px] rounded-xl px-4 text-base"
                  />
                </FormRow>
              </>
            )}

            <FormRow label="Method" htmlFor="payment-method">
              <Select value={method} onValueChange={(v) => setMethod((v as typeof method) ?? "CASH")}>
                <SelectTrigger id="payment-method" className="h-[52px]! w-full rounded-xl px-4">
                  <SelectValue>{METHOD_LABELS[method]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(METHOD_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormRow>
            <FormRow label="Note" htmlFor="payment-note" description="Optional">
              <Textarea
                id="payment-note"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="rounded-xl px-4 py-3"
              />
            </FormRow>
          </div>

          {/* Sticky footer */}
          <div className="pb-safe flex shrink-0 flex-col-reverse gap-2 border-t bg-background px-4 py-3 sm:flex-row sm:justify-end">
            <Button variant="outline" className="h-11" onClick={() => setLogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button className="h-11" onClick={handleLogPayment} disabled={saving}>
              {saving ? "Saving…" : "Log payment"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <PartyFormDialog open={editOpen} onOpenChange={setEditOpen} editing={party} onSaved={refresh} />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete party?"
        description={`"${party.name}" and their payment history will be permanently removed.`}
        confirmLabel="Delete"
        destructive
        onConfirm={handleDeleteParty}
      />
    </div>
  );
}
