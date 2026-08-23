"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Wallet, Search, Plus, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { FormRow } from "@/components/shared/form-row";
import { EmptyState } from "@/components/shared/empty-state";
import { api, ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/utils/currency";
import type { listCustomerAccounts } from "@/lib/services/wallet";
import type { serializeCustomerAccounts } from "@/lib/serialize";

type CustomerRow = ReturnType<typeof serializeCustomerAccounts<Awaited<ReturnType<typeof listCustomerAccounts>>[number]>>[number];

export function CustomerAccountsManager({
  initialCustomers,
  currency,
}: {
  initialCustomers: CustomerRow[];
  currency: string;
}) {
  const [customers, setCustomers] = useState(initialCustomers);
  const [query, setQuery] = useState("");
  const [adjustTarget, setAdjustTarget] = useState<CustomerRow | null>(null);
  const [direction, setDirection] = useState<"credit" | "debit">("credit");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q));
  }, [customers, query]);

  function openAdjust(customer: CustomerRow) {
    setAdjustTarget(customer);
    setDirection("credit");
    setAmount("");
    setDescription("");
  }

  async function handleAdjust() {
    if (!adjustTarget) return;
    const amountNum = Number(amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      toast.error("Enter a valid amount");
      return;
    }

    setSaving(true);
    try {
      const delta = direction === "credit" ? amountNum : -amountNum;
      const transaction = await api.post<{ balanceAfter: number }>(
        `/api/admin/customer-accounts/${adjustTarget.id}/wallet-adjustment`,
        { amount: delta, description: description || undefined }
      );
      setCustomers((prev) =>
        prev.map((c) => (c.id === adjustTarget.id ? { ...c, walletBalance: transaction.balanceAfter } : c))
      );
      toast.success(direction === "credit" ? "Wallet credited" : "Wallet debited");
      setAdjustTarget(null);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to adjust wallet");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Customers</h1>
        <p className="text-muted-foreground">Customer accounts and their reward-wallet balances.</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          placeholder="Search name or phone…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-8 h-9"
        />
      </div>

      {customers.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No customer accounts yet"
          description="Accounts customers create at checkout will show up here."
        />
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground px-1">No customers match this search.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card divide-y">
          {filtered.map((customer) => (
            <div key={customer.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{customer.name}</p>
                <p className="text-xs text-muted-foreground">{customer.phone}</p>
              </div>
              <p className="font-semibold text-sm shrink-0">{formatCurrency(customer.walletBalance, currency)}</p>
              <Button variant="outline" size="sm" onClick={() => openAdjust(customer)}>
                Adjust
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!adjustTarget} onOpenChange={(open) => !open && setAdjustTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust wallet — {adjustTarget?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Current balance: {adjustTarget ? formatCurrency(adjustTarget.walletBalance, currency) : ""}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={direction === "credit" ? "default" : "outline"}
                onClick={() => setDirection("credit")}
              >
                <Plus className="size-4" /> Credit
              </Button>
              <Button
                type="button"
                variant={direction === "debit" ? "default" : "outline"}
                onClick={() => setDirection("debit")}
              >
                <Minus className="size-4" /> Debit
              </Button>
            </div>
            <FormRow label="Amount" htmlFor="wallet-amount" required>
              <Input
                id="wallet-amount"
                type="number"
                min={0}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                autoFocus
              />
            </FormRow>
            <FormRow label="Note" htmlFor="wallet-note" description="Shown to you only, not the customer">
              <Textarea
                id="wallet-note"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Reason for this adjustment"
                rows={2}
              />
            </FormRow>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustTarget(null)}>
              Cancel
            </Button>
            <Button onClick={handleAdjust} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
