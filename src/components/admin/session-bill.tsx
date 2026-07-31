"use client";

import Image from "next/image";
import { Printer, ReceiptText, User, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils";
import type { BillLineItem, BillTotals } from "@/lib/services/billing";

type SessionData = {
  id: string;
  tableNumber: string;
  status: string;
  customerName: string | null;
  customerPhone: string | null;
  createdAt: string;
  paymentMethod: string | null;
};

type ShopData = {
  businessName: string;
  logoUrl: string | null;
  address: string | null;
  phone: string | null;
  gstNumber: string | null;
  currency: string;
  enableTableNumber: boolean;
};

export function SessionBill({
  session,
  items,
  bill,
  shop,
}: {
  session: SessionData;
  items: BillLineItem[];
  bill: BillTotals;
  shop: ShopData;
}) {
  const isPaid = session.status === "PAID" && !!session.paymentMethod && session.paymentMethod !== "VOID";

  return (
    <div className="max-w-2xl mx-auto space-y-6 p-4 print:max-w-none print:space-y-0 print:p-0">
      <div className="flex items-center justify-between print:hidden">
        <h1 className="text-xl font-bold">
          {shop.enableTableNumber ? `Table ${session.tableNumber}` : "Table Bill"}
        </h1>
        <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => window.print()}>
          <Printer className="size-4" /> Print
        </Button>
      </div>

      <div className="rounded-2xl border bg-card overflow-hidden print:rounded-none print:border-0">
        <div className="px-5 py-5 text-center border-b bg-muted/30">
          {shop.logoUrl ? (
            <Image
              src={shop.logoUrl}
              alt={shop.businessName}
              width={52}
              height={52}
              unoptimized
              className="mx-auto mb-3 rounded-full object-cover ring-2 ring-border"
            />
          ) : (
            <div className="mx-auto mb-3 size-[52px] rounded-full bg-primary/10 flex items-center justify-center">
              <ReceiptText className="size-6 text-primary" />
            </div>
          )}
          <p className="font-bold text-lg">{shop.businessName}</p>
          {shop.address ? <p className="text-xs text-muted-foreground mt-0.5">{shop.address}</p> : null}
          {shop.phone ? <p className="text-xs text-muted-foreground">{shop.phone}</p> : null}
          {shop.gstNumber ? <p className="text-xs text-muted-foreground">GSTIN: {shop.gstNumber}</p> : null}
        </div>

        <div className="px-5 py-4 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm border-b">
          {shop.enableTableNumber && (
            <div>
              <span className="text-muted-foreground text-xs uppercase tracking-wide">Table</span>
              <p className="font-medium">{session.tableNumber}</p>
            </div>
          )}
          <div>
            <span className="text-muted-foreground text-xs uppercase tracking-wide">Opened</span>
            <p className="font-medium">{new Date(session.createdAt).toLocaleString()}</p>
          </div>
          {session.customerName ? (
            <div>
              <span className="text-muted-foreground text-xs uppercase tracking-wide flex items-center gap-1">
                <User className="size-3" /> Customer
              </span>
              <p className="font-medium">{session.customerName}</p>
            </div>
          ) : null}
          {session.customerPhone ? (
            <div>
              <span className="text-muted-foreground text-xs uppercase tracking-wide flex items-center gap-1">
                <Phone className="size-3" /> Phone
              </span>
              <p className="font-medium">{session.customerPhone}</p>
            </div>
          ) : null}
        </div>

        <div className="divide-y">
          {items.map((item) => (
            <div key={`${item.id}-${item.name}`} className="px-5 py-3 flex items-center justify-between gap-3 text-sm">
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{item.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(item.price, shop.currency)} × {item.quantity}
                </p>
              </div>
              <p className="font-semibold shrink-0">{formatCurrency(item.price * item.quantity, shop.currency)}</p>
            </div>
          ))}
          {items.length === 0 && (
            <p className="px-5 py-4 text-sm text-muted-foreground">No active items on this table.</p>
          )}
        </div>

        <div className="px-5 py-4 space-y-2 border-t bg-muted/20 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Subtotal</span>
            <span>{formatCurrency(bill.subtotal, shop.currency)}</span>
          </div>
          {bill.taxLines.map((line) => (
            <div key={line.id} className="flex justify-between text-muted-foreground">
              <span>{line.name}</span>
              <span>{formatCurrency(line.amount, shop.currency)}</span>
            </div>
          ))}
          <div className="flex justify-between border-t pt-2 mt-1 font-bold text-base">
            <span>Grand Total</span>
            <span className="text-primary">{formatCurrency(bill.grandTotal, shop.currency)}</span>
          </div>
          <div className={cn("flex justify-between font-medium", isPaid ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400")}>
            <span>{isPaid ? `Paid via ${session.paymentMethod}` : "Payment pending"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
