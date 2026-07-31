"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
  ReceiptText,
  Wallet,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { FormRow } from "@/components/shared/form-row";
import { api, ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils";
import type { getPartyStatement } from "@/lib/services/party";

type Statement = Awaited<ReturnType<typeof getPartyStatement>>;

type Period = "today" | "week" | "month" | "year" | "all";

const PERIODS: { value: Period; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
  { value: "all", label: "All" },
];

const PERIOD_DAYS: Record<Exclude<Period, "all">, number> = { today: 1, week: 7, month: 30, year: 365 };

const METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  UPI: "UPI",
  CARD: "Card",
  BANK_TRANSFER: "Bank transfer",
  OTHER: "Other",
};

function isUnpaid(paymentMethod: string | null) {
  return paymentMethod === null || paymentMethod === "PENDING";
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
  const [statement, setStatement] = useState(initialStatement);
  const [period, setPeriod] = useState<Period>("all");
  // Date.now() can't be read during render (React purity rule) — captured
  // once on mount instead, same pattern as catalogLoadedAt in create-order-page.tsx.
  const [nowMs, setNowMs] = useState(0);
  useEffect(() => setNowMs(Date.now()), []);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<"RECEIVED" | "PAID">(
    statement.party.type === "SUPPLIER" ? "PAID" : "RECEIVED"
  );
  const [method, setMethod] = useState<"CASH" | "UPI" | "CARD" | "BANK_TRANSFER" | "OTHER">("CASH");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const { party } = statement;

  const timeline = useMemo(() => {
    type Entry = {
      id: string;
      date: string;
      kind: "order" | "payment";
      label: string;
      amount: number;
      badge: string;
      badgeTone: "amber" | "emerald" | "muted";
      href?: string;
    };
    const orderEntries: Entry[] = statement.orders.map((o) => ({
      id: `order-${o.id}`,
      date: o.createdAt,
      kind: "order",
      label: `Order #${o.billNumber} · ${o.itemCount} item${o.itemCount !== 1 ? "s" : ""}`,
      amount: o.discountedTotal ?? o.grandTotal,
      badge: isUnpaid(o.paymentMethod) ? "Unpaid" : "Paid",
      badgeTone: isUnpaid(o.paymentMethod) ? "amber" : "emerald",
      href: `/admin/orders/${o.id}`,
    }));
    const paymentEntries: Entry[] = statement.payments.map((p) => ({
      id: `payment-${p.id}`,
      date: p.createdAt,
      kind: "payment",
      label: `${p.direction === "RECEIVED" ? "Received" : "Paid"} via ${METHOD_LABELS[p.method] ?? p.method}${p.note ? ` — ${p.note}` : ""}`,
      amount: p.amount,
      badge: p.direction === "RECEIVED" ? "Received" : "Paid out",
      badgeTone: p.direction === "RECEIVED" ? "emerald" : "muted",
    }));
    const merged = [...orderEntries, ...paymentEntries].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    if (period === "all" || nowMs === 0) return merged;
    const cutoff = nowMs - PERIOD_DAYS[period] * 24 * 60 * 60 * 1000;
    return merged.filter((e) => new Date(e.date).getTime() >= cutoff);
  }, [statement, period, nowMs]);

  async function refresh() {
    const refreshed = await api.get<Statement>(`/api/admin/parties/${party.id}`);
    setStatement(refreshed);
  }

  async function handleLogPayment() {
    const num = Number(amount);
    if (!Number.isFinite(num) || num <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    setSaving(true);
    try {
      await api.post(`/api/admin/parties/${party.id}/payments`, { amount: num, method, direction, note });
      await refresh();
      toast.success("Payment logged");
      setLogOpen(false);
      setAmount("");
      setNote("");
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
          // skip logo on error
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

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => window.print()}>
          <Printer className="size-4" /> Print
        </Button>
        <Button variant="outline" size="sm" className="h-9 gap-1.5" disabled={sharing} onClick={handleShare}>
          <Share2 className="size-4" /> {sharing ? "Sharing…" : "Share"}
        </Button>
        <Button variant="outline" size="sm" className="h-9 gap-1.5" disabled={downloadingPdf} onClick={handleDownloadPdf}>
          <Download className="size-4" /> {downloadingPdf ? "Generating…" : "Export PDF"}
        </Button>
        <Button size="sm" className="h-9 gap-1.5" onClick={() => setLogOpen(true)}>
          <Plus className="size-4" /> Log Payment
        </Button>
      </div>

      {/* Party info card */}
      <div className="rounded-2xl border bg-card overflow-hidden print:rounded-none print:border-0">
        <div className="px-5 py-4 border-b bg-muted/30 flex items-center justify-between gap-2 flex-wrap">
          <div className="space-y-1 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Phone className="size-3.5" /> {party.phone}
            </div>
            {party.businessName && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Building2 className="size-3.5" /> {party.businessName}
              </div>
            )}
            {party.address && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="size-3.5" /> {party.address}
              </div>
            )}
            {party.gstNumber && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Receipt className="size-3.5" /> GST: {party.gstNumber}
              </div>
            )}
          </div>
          <Badge variant="secondary" className="text-xs">
            {party.category === "GENERAL" ? "General" : party.category.charAt(0) + party.category.slice(1).toLowerCase()}
          </Badge>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-3 divide-x">
          <div className="px-4 py-4 text-center">
            <p
              className={cn(
                "text-lg font-bold tabular-nums",
                statement.summary.outstanding > 0
                  ? "text-amber-600 dark:text-amber-400"
                  : statement.summary.outstanding < 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-foreground"
              )}
            >
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
            <p className="text-lg font-bold tabular-nums">{statement.summary.orderCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Orders</p>
          </div>
        </div>
      </div>

      {/* Period filter */}
      <div className="flex overflow-hidden rounded-md border text-xs w-fit print:hidden">
        {PERIODS.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => setPeriod(p.value)}
            className={cn(
              "px-3 py-1.5 font-medium transition-colors",
              period === p.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Timeline */}
      <div className="rounded-xl border overflow-hidden">
        <div className="bg-muted/30 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Activity
        </div>
        {timeline.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground text-center">No activity in this period.</p>
        ) : (
          <div className="divide-y">
            {timeline.map((entry) => {
              const content = (
                <div className="flex items-center gap-3 px-4 py-3 text-sm">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
                    {entry.kind === "order" ? (
                      <ReceiptText className="size-4 text-muted-foreground" />
                    ) : (
                      <Wallet className="size-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{entry.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(entry.date).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-semibold tabular-nums">{formatCurrency(entry.amount, shop.currency)}</p>
                    <span
                      className={cn(
                        "text-xs font-medium",
                        entry.badgeTone === "amber" && "text-amber-600 dark:text-amber-400",
                        entry.badgeTone === "emerald" && "text-emerald-600 dark:text-emerald-400",
                        entry.badgeTone === "muted" && "text-muted-foreground"
                      )}
                    >
                      {entry.badge}
                    </span>
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

      {/* Log Payment dialog */}
      <Dialog open={logOpen} onOpenChange={setLogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="size-4 text-primary" /> Log Payment — {party.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex overflow-hidden rounded-md border text-sm">
              {(["RECEIVED", "PAID"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDirection(d)}
                  className={cn(
                    "flex-1 px-3 py-2 font-medium transition-colors",
                    direction === d ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  {d === "RECEIVED" ? "Received" : "Paid out"}
                </button>
              ))}
            </div>
            <FormRow label="Amount" htmlFor="payment-amount" required>
              <Input id="payment-amount" type="number" step="0.01" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
            </FormRow>
            <FormRow label="Method" htmlFor="payment-method">
              <Select value={method} onValueChange={(v) => setMethod((v as typeof method) ?? "CASH")}>
                <SelectTrigger id="payment-method" className="w-full">
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
              <Textarea id="payment-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </FormRow>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleLogPayment} disabled={saving}>
              {saving ? "Saving…" : "Log payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
