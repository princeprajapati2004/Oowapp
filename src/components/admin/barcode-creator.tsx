"use client";

import { useState } from "react";
import Image from "next/image";
import { Printer, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImageUploader } from "@/components/shared/image-uploader";
import { BarcodeSvg } from "@/components/shared/barcode-svg";

type BarcodeItem = {
  id: string;
  name: string;
  quantity: number;
  photoUrl: string | null;
  code: string;
};

function generateCode() {
  return `BC-${Date.now().toString(36).toUpperCase()}`;
}

export function BarcodeCreator({ businessName }: { businessName: string }) {
  const [items, setItems] = useState<BarcodeItem[]>([]);
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [code, setCode] = useState("");

  function handleAdd() {
    if (!name.trim()) return;
    const qty = Math.max(1, Number(quantity) || 1);
    setItems((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name: name.trim(),
        quantity: qty,
        photoUrl,
        code: code.trim() || generateCode(),
      },
    ]);
    setName("");
    setQuantity("1");
    setPhotoUrl(null);
    setCode("");
  }

  function handleRemove(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  return (
    <div className="max-w-3xl space-y-6 print:max-w-none">
      <div className="print:hidden">
        <h1 className="text-2xl font-bold tracking-tight">Barcodes</h1>
        <p className="text-muted-foreground">Create and print a barcode label for any item — no order needed.</p>
      </div>

      {/* Add item form */}
      <div className="rounded-2xl border bg-card p-4 space-y-4 print:hidden">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Item name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Chicken Biryani" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Quantity</Label>
            <Input type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Barcode value (optional)</Label>
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Leave blank to auto-generate" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Photo (optional)</Label>
          <ImageUploader value={photoUrl} onChange={setPhotoUrl} shape="square" label="Item photo" />
        </div>
        <Button onClick={handleAdd} disabled={!name.trim()} className="gap-1.5">
          <Plus className="size-4" /> Add item
        </Button>
      </div>

      {/* Generated labels */}
      {items.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between print:hidden">
            <p className="text-sm font-semibold">
              {items.length} label{items.length === 1 ? "" : "s"} ready
            </p>
            <Button onClick={() => window.print()} className="gap-1.5">
              <Printer className="size-4" /> Print
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 print:grid-cols-2 print:gap-2">
            {items.map((item) => (
              <div
                key={item.id}
                className="relative flex break-inside-avoid flex-col items-center gap-1 rounded-lg border p-3 text-center print:rounded-none print:border-black"
              >
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="absolute right-1 top-1 text-muted-foreground hover:text-destructive print:hidden"
                  onClick={() => handleRemove(item.id)}
                  aria-label="Remove"
                >
                  <Trash2 className="size-3.5" />
                </Button>
                <p className="text-xs font-semibold uppercase tracking-wide">{businessName}</p>
                {item.photoUrl && (
                  <Image
                    src={item.photoUrl}
                    alt={item.name}
                    width={64}
                    height={64}
                    unoptimized
                    className="size-16 rounded object-cover"
                  />
                )}
                <BarcodeSvg value={item.code} />
                <p className="text-sm font-medium leading-tight">{item.name}</p>
                <p className="text-xs text-muted-foreground">
                  Qty {item.quantity} · {item.code}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
