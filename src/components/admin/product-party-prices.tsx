"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api, ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/utils/currency";

interface PartyOption {
  id: string;
  name: string;
  phone: string;
}

interface PartyPriceRow {
  id: string;
  partyId: string;
  price: number;
  party: { id: string; name: string; phone: string };
}

// Item Master — "PARTY-WISE PRICE" section of the product form (spec §5).
// Only rendered for an already-saved product (a new, unsaved product has no
// id to attach overrides to) — see ProductsManager's usage.
export function ProductPartyPrices({
  productId,
  parties,
  currency,
}: {
  productId: string;
  parties: PartyOption[];
  currency: string;
}) {
  const [rows, setRows] = useState<PartyPriceRow[] | null>(null);
  const [selectedPartyId, setSelectedPartyId] = useState("");
  const [priceInput, setPriceInput] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get<PartyPriceRow[]>(`/api/admin/products/${productId}/party-prices`)
      .then((data) => {
        if (!cancelled) setRows(data.map((r) => ({ ...r, price: Number(r.price) })));
      })
      .catch(() => !cancelled && setRows([]));
    return () => {
      cancelled = true;
    };
  }, [productId]);

  const availableParties = parties.filter((p) => !rows?.some((r) => r.partyId === p.id));

  async function handleAdd() {
    const priceNum = Number(priceInput);
    if (!selectedPartyId) return toast.error("Select a party");
    if (!Number.isFinite(priceNum) || priceNum < 0) return toast.error("Enter a valid price");
    setSaving(true);
    try {
      const row = await api.post<PartyPriceRow>(`/api/admin/products/${productId}/party-prices`, {
        partyId: selectedPartyId,
        price: priceNum,
      });
      setRows((prev) => [...(prev ?? []), { ...row, price: Number(row.price) }]);
      setSelectedPartyId("");
      setPriceInput("");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(row: PartyPriceRow) {
    const prev = rows;
    setRows((r) => r?.filter((x) => x.id !== row.id) ?? null);
    try {
      await api.delete(`/api/admin/products/${productId}/party-prices/${row.partyId}`);
    } catch (error) {
      setRows(prev ?? null);
      toast.error(error instanceof ApiError ? error.message : "Failed to remove");
    }
  }

  return (
    <div className="space-y-2">
      {rows === null ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">No custom prices set — everyone pays the normal selling price.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card divide-y">
          {rows.map((row) => (
            <div key={row.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{row.party.name}</p>
                <p className="text-xs text-muted-foreground">{row.party.phone}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-sm font-semibold">{formatCurrency(row.price, currency)}</span>
                <Button variant="ghost" size="icon-sm" onClick={() => handleRemove(row)} aria-label="Remove">
                  <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {availableParties.length > 0 && (
        <div className="flex gap-2">
          <Select value={selectedPartyId} onValueChange={(v) => setSelectedPartyId(v ?? "")}>
            <SelectTrigger className="flex-1">
              <SelectValue>
                {availableParties.find((p) => p.id === selectedPartyId)?.name ?? "Select party"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {availableParties.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name} · {p.phone}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="number"
            min={0}
            step="0.01"
            placeholder="Price"
            className="w-24"
            value={priceInput}
            onChange={(e) => setPriceInput(e.target.value)}
          />
          <Button variant="outline" size="icon" onClick={handleAdd} disabled={saving} aria-label="Add price">
            <Plus className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
