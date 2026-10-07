"use client";

import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/date";

interface Transaction {
  id: string;
  ownerEmail: string;
  planName: string;
  billingCycle: string;
  baseAmount: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  currency: string;
  status: string;
  couponCode: string | null;
  invoiceNumber: string | null;
  paidAt: string | null;
  createdAt: string;
}

const STATUS_STYLES: Record<string, string> = {
  SUCCESS: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  INITIATED: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  PENDING: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  FAILED: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  CANCELLED: "bg-muted text-muted-foreground",
  REFUNDED: "bg-muted text-muted-foreground",
};

export function TransactionsTable({ transactions, total }: { transactions: Transaction[]; total: number }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{total.toLocaleString()} transaction{total !== 1 ? "s" : ""}.</p>
      <Card>
        <CardContent className="p-0">
          {transactions.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">No transactions yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-left">Owner</th>
                    <th className="px-3 py-2 text-left">Plan</th>
                    <th className="px-3 py-2 text-left">Cycle</th>
                    <th className="px-3 py-2 text-left">Coupon</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">Invoice</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {transactions.map((t) => (
                    <tr key={t.id}>
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{formatDate(t.createdAt)}</td>
                      <td className="px-3 py-2 truncate max-w-[180px]">{t.ownerEmail}</td>
                      <td className="px-3 py-2">{t.planName}</td>
                      <td className="px-3 py-2 text-muted-foreground">{t.billingCycle}</td>
                      <td className="px-3 py-2 text-muted-foreground">{t.couponCode ?? "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(t.totalAmount, t.currency)}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[t.status] ?? STATUS_STYLES.CANCELLED}`}>
                          {t.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{t.invoiceNumber ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
