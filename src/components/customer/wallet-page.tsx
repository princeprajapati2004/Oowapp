"use client";

import Link from "next/link";
import { ArrowLeft, Wallet, ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency } from "@/lib/utils/currency";

type WalletTransactionRow = {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  description: string | null;
  createdAt: string;
};

const TYPE_LABELS: Record<string, string> = {
  CASHBACK_CREDIT: "Cashback",
  REFERRAL_CREDIT: "Referral reward",
  REDEMPTION_DEBIT: "Redeemed at checkout",
  ADMIN_ADJUSTMENT: "Adjustment",
};

export function WalletPage({
  slug,
  businessName,
  currency,
  balance,
  transactions,
}: {
  slug: string;
  businessName: string;
  currency: string;
  balance: number;
  transactions: WalletTransactionRow[];
}) {
  return (
    <div className="min-h-screen bg-muted/20 px-4 py-6">
      <div className="mx-auto max-w-md space-y-4">
        <div className="flex items-center gap-2">
          <Link
            href={`/order/${slug}`}
            aria-label="Back to menu"
            className="flex size-9 items-center justify-center rounded-full hover:bg-muted transition-colors"
          >
            <ArrowLeft className="size-4.5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Your wallet</h1>
            <p className="text-sm text-muted-foreground">{businessName}</p>
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-6 text-center space-y-1">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Wallet className="size-6" />
          </div>
          <p className="text-sm text-muted-foreground">Available balance</p>
          <p className="text-3xl font-bold tracking-tight">{formatCurrency(balance, currency)}</p>
        </div>

        {transactions.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="No activity yet"
            description="Rewards you earn and credit you redeem will show up here."
          />
        ) : (
          <div className="overflow-hidden rounded-xl border bg-card divide-y">
            {transactions.map((t) => {
              const isCredit = t.amount >= 0;
              return (
                <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                  {isCredit ? (
                    <ArrowDownCircle className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <ArrowUpCircle className="size-5 shrink-0 text-muted-foreground" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{TYPE_LABELS[t.type] ?? t.type}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(t.createdAt).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {t.description ? ` · ${t.description}` : ""}
                    </p>
                  </div>
                  <span
                    className={`text-sm font-semibold shrink-0 ${isCredit ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"}`}
                  >
                    {isCredit ? "+" : "−"}
                    {formatCurrency(Math.abs(t.amount), currency)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
