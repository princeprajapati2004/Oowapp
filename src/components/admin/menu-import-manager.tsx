"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { toast } from "sonner";
import {
  AlertTriangle,
  FileSpreadsheet,
  History,
  ImageOff,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EmptyState } from "@/components/shared/empty-state";
import { MenuImagePicker } from "@/components/admin/menu-image-picker";
import { api } from "@/lib/api-client";
import { isFoodBusiness, type BusinessType } from "@/lib/business-types";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils";
import type { Category } from "@/generated/prisma/client";

type SourceType = "PHOTO" | "PDF" | "EXCEL" | "CSV" | "TEXT";
type FoodType = "VEG" | "NON_VEG" | "EGG" | "NA";
type Resolution = "skip" | "update" | "keep_both";

interface ExtractedItem {
  name: string;
  description: string | null;
  price: number | null;
  category: string;
  foodType: FoodType;
  gstNote: string | null;
  isCombo: boolean;
  offerNote: string | null;
  confidence: "high" | "low";
  existingProductId: string | null;
  duplicateOf: { id: string; name: string; price: number; imageUrl: string | null } | null;
}

interface DraftItem {
  key: string;
  name: string;
  description: string;
  price: string;
  category: string;
  foodType: FoodType;
  gstNote: string | null;
  isCombo: boolean;
  offerNote: string;
  confidence: "high" | "low";
  imageUrl: string | null;
  existingProductId: string | null;
  duplicateOf: { id: string; name: string; price: number; imageUrl: string | null } | null;
  resolution: Resolution;
}

function blankDraftItem(category: string): DraftItem {
  return {
    key: newKey(),
    name: "",
    description: "",
    price: "",
    category,
    foodType: "NA",
    gstNote: null,
    isCombo: false,
    offerNote: "",
    confidence: "high",
    imageUrl: null,
    existingProductId: null,
    duplicateOf: null,
    resolution: "keep_both",
  };
}

interface CommitResult {
  importId: string;
  imported: number;
  updated: number;
  skipped: number;
}

const ACCEPT =
  "image/*,.heic,.heif,.pdf,.xlsx,.xls,.csv,.txt,application/pdf,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel";

function newKey() {
  return Math.random().toString(36).slice(2);
}

export function MenuImportManager({
  categories,
  currency,
  businessType,
}: {
  categories: Category[];
  currency: string;
  businessType: BusinessType;
}) {
  const [phase, setPhase] = useState<"idle" | "extracting" | "review" | "committing" | "done">("idle");
  const [items, setItems] = useState<DraftItem[]>([]);
  const [sourceType, setSourceType] = useState<SourceType | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [result, setResult] = useState<CommitResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const showFoodType = isFoodBusiness(businessType);

  async function handleFile(file: File) {
    setPhase("extracting");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/admin/menu-import/extract", { method: "POST", body: formData });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Couldn't read this file");

      const extracted: ExtractedItem[] = body.items;
      setSourceType(body.sourceType);
      setFileName(body.fileName);
      setItems(
        extracted.map((item) => ({
          key: newKey(),
          name: item.name,
          description: item.description ?? "",
          price: item.price === null ? "" : String(item.price),
          category: item.category,
          foodType: item.foodType,
          gstNote: item.gstNote,
          isCombo: item.isCombo,
          offerNote: item.offerNote ?? "",
          confidence: item.confidence,
          imageUrl: item.duplicateOf?.imageUrl ?? null,
          existingProductId: item.existingProductId,
          duplicateOf: item.duplicateOf,
          resolution: item.duplicateOf ? "update" : "keep_both",
        }))
      );
      setPhase("review");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't read this file");
      setPhase("idle");
    }
  }

  function updateItem(key: string, patch: Partial<DraftItem>) {
    setItems((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  function removeItem(key: string) {
    setItems((prev) => prev.filter((item) => item.key !== key));
  }

  function addBlankItem() {
    setItems((prev) => [...prev, blankDraftItem(categories[0]?.name ?? "Uncategorized")]);
  }

  function reset() {
    setPhase("idle");
    setItems([]);
    setSourceType(null);
    setFileName(null);
    setResult(null);
  }

  async function handleCommit() {
    if (items.length === 0 || !sourceType) return;
    setPhase("committing");
    try {
      const payload = {
        sourceType,
        fileName,
        items: items.map((item) => ({
          name: item.name,
          description: item.description.trim() || null,
          price: item.price.trim() === "" ? null : Number(item.price),
          category: item.category,
          foodType: item.foodType,
          gstNote: item.gstNote,
          isCombo: item.isCombo,
          offerNote: item.offerNote.trim() || null,
          confidence: item.confidence,
          existingProductId: item.existingProductId,
          resolution: item.duplicateOf ? item.resolution : undefined,
          imageUrl: item.imageUrl,
        })),
      };
      const res = await api.post<CommitResult>("/api/admin/menu-import/commit", payload);
      setResult(res);
      setPhase("done");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import failed");
      setPhase("review");
    }
  }

  const duplicateCount = items.filter((i) => i.duplicateOf).length;
  const lowConfidenceCount = items.filter((i) => i.confidence === "low").length;

  if (phase === "idle" || phase === "extracting") {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">AI Menu Import</h1>
            <p className="text-sm text-muted-foreground">
              Upload a menu photo, PDF, spreadsheet, or text file — items are extracted automatically.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            render={<Link href="/admin/menu-import/history" />}
            nativeButton={false}
          >
            <History className="size-4" /> Import history
          </Button>
        </div>

        <div
          className={cn(
            "flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed py-16 text-center transition-colors",
            dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25"
          )}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file) handleFile(file);
          }}
        >
          {phase === "extracting" ? (
            <>
              <Loader2 className="size-8 animate-spin text-primary" />
              <p className="text-sm font-medium">Reading your menu…</p>
              <p className="text-xs text-muted-foreground">This can take a moment for photos and PDFs.</p>
            </>
          ) : (
            <>
              <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10">
                <Sparkles className="size-7 text-primary" />
              </div>
              <p className="text-sm font-medium">Drag a file here, or</p>
              <Button type="button" onClick={() => inputRef.current?.click()}>
                <Upload className="size-4" /> Choose a file
              </Button>
              <p className="max-w-sm text-xs text-muted-foreground">
                Supports photos of handwritten/printed menus, PDF menus, Excel/CSV sheets, and plain text lists.
              </p>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = "";
            }}
          />
        </div>
      </div>
    );
  }

  if (phase === "done" && result) {
    return (
      <div className="space-y-4">
        <EmptyState
          icon={Sparkles}
          title="Import complete"
          description={`${result.imported} item${result.imported === 1 ? "" : "s"} added, ${result.updated} updated, ${result.skipped} skipped.`}
          action={
            <div className="flex gap-2">
              <Button onClick={reset}>Import another file</Button>
              <Button variant="outline" render={<Link href="/admin/products" />} nativeButton={false}>
                View products
              </Button>
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">Review before importing</h1>
          <p className="text-sm text-muted-foreground">
            {items.length} item{items.length === 1 ? "" : "s"} found in {fileName}
            {duplicateCount > 0 && ` · ${duplicateCount} match existing products`}
            {lowConfidenceCount > 0 && ` · ${lowConfidenceCount} need a closer look`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={addBlankItem} disabled={phase === "committing"}>
            <Plus className="size-4" /> Add item
          </Button>
          <Button variant="outline" onClick={reset} disabled={phase === "committing"}>
            Cancel
          </Button>
          <Button onClick={handleCommit} disabled={items.length === 0 || phase === "committing"}>
            {phase === "committing" && <Loader2 className="size-4 animate-spin" />}
            Import {items.length} item{items.length === 1 ? "" : "s"}
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14">Image</TableHead>
              <TableHead className="min-w-40">Name</TableHead>
              <TableHead className="w-28">Price</TableHead>
              <TableHead className="min-w-32">Category</TableHead>
              {showFoodType && <TableHead className="w-24">Type</TableHead>}
              <TableHead className="min-w-40">Description</TableHead>
              <TableHead className="w-16 text-center">Combo</TableHead>
              <TableHead className="min-w-32">Offer</TableHead>
              <TableHead className="min-w-44">Duplicate</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow
                key={item.key}
                className={cn(item.confidence === "low" && "bg-amber-50 dark:bg-amber-950/20")}
              >
                <TableCell>
                  <button
                    type="button"
                    onClick={() => setPickerFor(item.key)}
                    className="relative flex size-10 items-center justify-center overflow-hidden rounded-md border bg-muted/40"
                  >
                    {item.imageUrl ? (
                      <Image src={item.imageUrl} alt={item.name} fill className="object-cover" unoptimized />
                    ) : (
                      <ImageOff className="size-4 text-muted-foreground" />
                    )}
                  </button>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    {item.confidence === "low" && (
                      <Tooltip>
                        <TooltipTrigger>
                          <AlertTriangle className="size-3.5 shrink-0 text-amber-600" />
                        </TooltipTrigger>
                        <TooltipContent>Low confidence — please verify</TooltipContent>
                      </Tooltip>
                    )}
                    <Input
                      value={item.name}
                      onChange={(e) => updateItem(item.key, { name: e.target.value })}
                      className="h-8"
                    />
                  </div>
                  {item.gstNote && (
                    <p className="mt-0.5 text-[11px] text-muted-foreground">GST: {item.gstNote}</p>
                  )}
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    step="0.01"
                    value={item.price}
                    onChange={(e) => updateItem(item.key, { price: e.target.value })}
                    placeholder="—"
                    className="h-8"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={item.category}
                    onChange={(e) => updateItem(item.key, { category: e.target.value })}
                    list="menu-import-categories"
                    className="h-8"
                  />
                </TableCell>
                {showFoodType && (
                  <TableCell>
                    <Select
                      value={item.foodType}
                      onValueChange={(v) => updateItem(item.key, { foodType: v as FoodType })}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="VEG">Veg</SelectItem>
                        <SelectItem value="NON_VEG">Non-veg</SelectItem>
                        <SelectItem value="EGG">Egg</SelectItem>
                        <SelectItem value="NA">N/A</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                )}
                <TableCell>
                  <Input
                    value={item.description}
                    onChange={(e) => updateItem(item.key, { description: e.target.value })}
                    className="h-8"
                  />
                </TableCell>
                <TableCell className="text-center">
                  <Checkbox
                    checked={item.isCombo}
                    onCheckedChange={(checked) => updateItem(item.key, { isCombo: checked === true })}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={item.offerNote}
                    onChange={(e) => updateItem(item.key, { offerNote: e.target.value })}
                    placeholder="—"
                    className="h-8"
                  />
                </TableCell>
                <TableCell>
                  {item.duplicateOf ? (
                    <div className="space-y-1">
                      <Badge variant="outline" className="whitespace-normal text-left">
                        Matches &quot;{item.duplicateOf.name}&quot; ({formatCurrency(item.duplicateOf.price, currency)})
                      </Badge>
                      <Select
                        value={item.resolution}
                        onValueChange={(v) => updateItem(item.key, { resolution: v as Resolution })}
                      >
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="update">Update existing</SelectItem>
                          <SelectItem value="skip">Skip</SelectItem>
                          <SelectItem value="keep_both">Keep both</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">New item</span>
                  )}
                </TableCell>
                <TableCell>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    onClick={() => removeItem(item.key)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {items.length === 0 && (
          <div className="p-6">
            <EmptyState icon={FileSpreadsheet} title="No items left" description="Every row was removed." />
          </div>
        )}
      </div>

      <datalist id="menu-import-categories">
        {categories.map((c) => (
          <option key={c.id} value={c.name} />
        ))}
      </datalist>

      {pickerFor && (
        <MenuImagePicker
          open
          onOpenChange={(open) => !open && setPickerFor(null)}
          suggestedName={items.find((i) => i.key === pickerFor)?.name}
          onSelect={(url) => {
            updateItem(pickerFor, { imageUrl: url });
            setPickerFor(null);
          }}
        />
      )}
    </div>
  );
}
