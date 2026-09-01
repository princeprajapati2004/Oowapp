"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, Search, ChevronDown, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { ReportPageHeader } from "@/components/admin/reports/report-page-header";
import { ReportSelect } from "@/components/admin/reports/report-select";
import { PartyFormDialog } from "@/components/admin/party-form-dialog";
import { api, ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/utils/currency";
import { PAYMENT_METHODS } from "@/lib/order-status";

interface Product {
  id: string;
  name: string;
  unit: string | null;
  costPrice: number | null;
}

interface Supplier {
  id: string;
  name: string;
  phone: string;
  gstNumber: string | null;
}

interface ItemRow {
  productId: string;
  quantity: string;
  purchasePrice: string;
  taxAmount: string;
}

function emptyRow(): ItemRow {
  return { productId: "", quantity: "1", purchasePrice: "", taxAmount: "" };
}

export function PurchaseForm({ products, suppliers: initialSuppliers }: { products: Product[]; suppliers: Supplier[] }) {
  const router = useRouter();
  const [suppliers, setSuppliers] = useState<Supplier[]>(initialSuppliers);
  const [supplierId, setSupplierId] = useState("");
  const [supplierQuery, setSupplierQuery] = useState("");
  const [supplierPickerOpen, setSupplierPickerOpen] = useState(false);
  const [addSupplierOpen, setAddSupplierOpen] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [items, setItems] = useState<ItemRow[]>([emptyRow()]);
  const [discountAmount, setDiscountAmount] = useState("");
  const [paidAmount, setPaidAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<string>("CASH");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const selectedSupplier = suppliers.find((s) => s.id === supplierId) ?? null;
  const filteredSuppliers = useMemo(() => {
    const q = supplierQuery.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter((s) => s.name.toLowerCase().includes(q) || s.phone.includes(q));
  }, [suppliers, supplierQuery]);
  const productOptions = products.map((p) => ({ value: p.id, label: p.name }));
  const paymentMethodOptions = PAYMENT_METHODS.map((m) => ({ value: m.value, label: m.label }));

  function updateItem(index: number, patch: Partial<ItemRow>) {
    setItems((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addRow() {
    setItems((prev) => [...prev, emptyRow()]);
  }

  function removeRow(index: number) {
    setItems((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }

  function onProductSelected(index: number, productId: string) {
    const product = products.find((p) => p.id === productId);
    updateItem(index, {
      productId,
      purchasePrice: product?.costPrice != null ? String(product.costPrice) : items[index].purchasePrice,
    });
  }

  const subtotal = items.reduce((sum, row) => sum + (Number(row.quantity) || 0) * (Number(row.purchasePrice) || 0), 0);
  const taxTotal = items.reduce((sum, row) => sum + (Number(row.taxAmount) || 0), 0);
  const grandTotal = Math.max(0, subtotal + taxTotal - (Number(discountAmount) || 0));

  async function handleSubmit() {
    if (!supplierId) {
      toast.error("Select a supplier");
      return;
    }
    const validItems = items.filter((row) => row.productId && Number(row.quantity) > 0);
    if (validItems.length === 0) {
      toast.error("Add at least one item");
      return;
    }

    setSubmitting(true);
    try {
      const purchase = await api.post<{ id: string }>("/api/admin/purchases", {
        supplierId,
        invoiceNumber: invoiceNumber || undefined,
        purchaseDate,
        items: validItems.map((row) => ({
          productId: row.productId,
          quantity: Number(row.quantity),
          purchasePrice: Number(row.purchasePrice) || 0,
          taxAmount: row.taxAmount ? Number(row.taxAmount) : undefined,
        })),
        discountAmount: discountAmount ? Number(discountAmount) : undefined,
        paidAmount: paidAmount ? Number(paidAmount) : undefined,
        paymentMethod: paidAmount ? paymentMethod : undefined,
        notes: notes || undefined,
        clientRequestId: crypto.randomUUID(),
      });
      toast.success("Purchase recorded");
      router.push(`/admin/purchases/${purchase.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to record purchase");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-5">
      <ReportPageHeader title="New Purchase" description="Record stock received from a supplier." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Supplier</Label>
          <Popover
            open={supplierPickerOpen}
            onOpenChange={(next) => {
              setSupplierPickerOpen(next);
              if (!next) setSupplierQuery("");
            }}
          >
            <PopoverTrigger
              render={<button type="button" className="flex h-10 w-full items-center justify-between rounded-md border bg-transparent px-3 text-sm" />}
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <Building2 className="size-3.5 shrink-0 text-muted-foreground" />
                <span className={selectedSupplier ? "truncate" : "truncate text-muted-foreground"}>
                  {selectedSupplier ? `${selectedSupplier.name} (${selectedSupplier.phone})` : "Select supplier"}
                </span>
              </span>
              <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
            </PopoverTrigger>
            <PopoverContent className="w-[--anchor-width] min-w-72 p-0" align="start">
              <div className="p-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    autoFocus
                    value={supplierQuery}
                    onChange={(e) => setSupplierQuery(e.target.value)}
                    placeholder="Search suppliers…"
                    className="h-9 pl-8"
                  />
                </div>
              </div>
              <div className="max-h-56 overflow-y-auto border-t">
                {filteredSuppliers.length === 0 ? (
                  <p className="px-3 py-4 text-center text-sm text-muted-foreground">No suppliers found</p>
                ) : (
                  filteredSuppliers.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setSupplierId(s.id);
                        setSupplierPickerOpen(false);
                        setSupplierQuery("");
                      }}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted/60"
                    >
                      <span className="truncate">{s.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{s.phone}</span>
                    </button>
                  ))
                )}
              </div>
              <div className="border-t p-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start gap-1.5"
                  onClick={() => {
                    setSupplierPickerOpen(false);
                    setAddSupplierOpen(true);
                  }}
                >
                  <Plus className="size-3.5" /> Add new supplier
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <div className="space-y-1.5">
          <Label>Purchase Date</Label>
          <Input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} className="h-10" />
        </div>
        <div className="space-y-1.5">
          <Label>Supplier Invoice No. (optional)</Label>
          <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} className="h-10" placeholder="e.g. INV-2201" />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Items</Label>
        <div className="space-y-2">
          {items.map((row, index) => (
            <div key={index} className="grid grid-cols-1 gap-2 rounded-lg p-3 ring-1 ring-foreground/10 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]">
              <ReportSelect
                value={row.productId || "__none__"}
                onValueChange={(v) => onProductSelected(index, v === "__none__" ? "" : v)}
                options={[{ value: "__none__", label: "Select product" }, ...productOptions]}
              />
              <Input
                type="number"
                min="1"
                placeholder="Qty"
                value={row.quantity}
                onChange={(e) => updateItem(index, { quantity: e.target.value })}
                className="h-10"
              />
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="Price/unit"
                value={row.purchasePrice}
                onChange={(e) => updateItem(index, { purchasePrice: e.target.value })}
                className="h-10"
              />
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="Tax (optional)"
                value={row.taxAmount}
                onChange={(e) => updateItem(index, { taxAmount: e.target.value })}
                className="h-10"
              />
              <Button variant="ghost" size="icon" onClick={() => removeRow(index)} aria-label="Remove item">
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={addRow}>
          <Plus className="size-3.5" />
          Add Item
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Discount (optional)</Label>
          <Input type="number" min="0" step="0.01" value={discountAmount} onChange={(e) => setDiscountAmount(e.target.value)} className="h-10" />
        </div>
        <div className="space-y-1.5">
          <Label>Paid Now (optional)</Label>
          <Input type="number" min="0" step="0.01" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} className="h-10" />
        </div>
        <div className="space-y-1.5">
          <Label>Payment Method</Label>
          <ReportSelect value={paymentMethod} onValueChange={setPaymentMethod} options={paymentMethodOptions} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Notes (optional)</Label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any additional details..." />
      </div>

      <div className="space-y-1 rounded-lg p-4 ring-1 ring-foreground/10">
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>Subtotal</span>
          <span>{formatCurrency(subtotal)}</span>
        </div>
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>Tax</span>
          <span>{formatCurrency(taxTotal)}</span>
        </div>
        <div className="flex justify-between text-base font-semibold">
          <span>Grand Total</span>
          <span>{formatCurrency(grandTotal)}</span>
        </div>
      </div>

      <Button className="h-11 w-full" disabled={submitting} onClick={handleSubmit}>
        {submitting ? "Saving..." : "Record Purchase"}
      </Button>

      <PartyFormDialog
        open={addSupplierOpen}
        onOpenChange={setAddSupplierOpen}
        editing={null}
        defaultType="SUPPLIER"
        onSaved={(created) => {
          if (!created) return;
          setSuppliers((prev) => [...prev, { id: created.id, name: created.name, phone: created.phone, gstNumber: null }]);
          setSupplierId(created.id);
        }}
      />
    </div>
  );
}
