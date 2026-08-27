"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Search, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { api } from "@/lib/api-client";
import { formatCurrency } from "@/lib/utils/currency";

interface PurchaseListRow {
  id: string;
  purchaseNumber: string;
  purchaseDate: string;
  supplier: { id: string; name: string; phone: string };
  grandTotal: string | number;
  paidAmount: string | number | null;
  paymentStatus: string;
  status: string;
  items: { id: string }[];
}

interface PurchasesResponse {
  purchases: PurchaseListRow[];
  total: number;
  page: number;
  pageSize: number;
}

const PAYMENT_BADGE: Record<string, string> = {
  PAID: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  PARTIALLY_PAID: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  PENDING: "bg-muted text-muted-foreground",
};

export function PurchasesListView() {
  const [search, setSearch] = useState("");
  const [data, setData] = useState<PurchasesResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    api
      .get<PurchasesResponse>(`/api/admin/purchases?${params.toString()}`)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [search]);

  const purchases = data?.purchases ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-xl font-semibold">Purchases</h1>
          <p className="text-sm text-muted-foreground">Record supplier stock-ins and track payments.</p>
        </div>
        <Link href="/admin/purchases/new">
          <Button className="h-10 gap-1.5">
            <Plus className="size-4" />
            New Purchase
          </Button>
        </Link>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search PO number, supplier, invoice no."
          className="h-10 pl-8"
        />
      </div>

      {!loading && purchases.length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          title="No purchases yet"
          description="Record a supplier purchase to receive stock and track what you owe."
          action={
            <Link href="/admin/purchases/new">
              <Button className="h-9">Record Purchase</Button>
            </Link>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-lg ring-1 ring-foreground/10">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Purchase No.</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Items</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {purchases.map((p) => (
                <TableRow key={p.id} className="cursor-pointer">
                  <TableCell>
                    <Link href={`/admin/purchases/${p.id}`} className="font-medium text-primary hover:underline">
                      {p.purchaseNumber}
                    </Link>
                  </TableCell>
                  <TableCell>{new Date(p.purchaseDate).toLocaleDateString("en-IN")}</TableCell>
                  <TableCell>{p.supplier.name}</TableCell>
                  <TableCell>{p.items.length}</TableCell>
                  <TableCell className="text-right">{formatCurrency(p.grandTotal)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(p.paidAmount ?? 0)}</TableCell>
                  <TableCell>
                    {p.status === "CANCELLED" ? (
                      <Badge variant="destructive">Cancelled</Badge>
                    ) : (
                      <Badge className={PAYMENT_BADGE[p.paymentStatus] ?? ""}>{p.paymentStatus.replace("_", " ")}</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
