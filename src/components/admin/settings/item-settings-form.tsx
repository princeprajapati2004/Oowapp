"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { itemSettingsSchema, type ItemSettingsInput } from "@/lib/validation/item-settings";
import { api, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { ToggleRow } from "@/components/shared/toggle-row";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export function ItemSettingsForm({
  defaultValues,
  bare,
}: {
  defaultValues: ItemSettingsInput;
  bare?: boolean;
}) {
  const {
    handleSubmit,
    watch,
    setValue,
    formState: { isSubmitting },
  } = useForm<ItemSettingsInput>({
    resolver: zodResolver(itemSettingsSchema),
    defaultValues,
  });

  const values = watch();

  async function onSubmit(data: ItemSettingsInput) {
    try {
      await api.patch("/api/admin/item-settings", data);
      toast.success("Item settings saved");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to save");
    }
  }

  const formContent = (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="space-y-1">
        <p className="text-sm font-medium">Core fields</p>
        <p className="text-xs text-muted-foreground">
          Name, Selling price and Unit are always required and can&apos;t be turned off.
        </p>
      </div>
      <ToggleRow
        label="Category required"
        description="Turn off if some products don't need a category."
        checked={values.categoryRequired}
        onCheckedChange={(v) => setValue("categoryRequired", v)}
      />
      <ToggleRow
        label="HSN code"
        description="Show an HSN/SAC code field on the product form and invoices."
        checked={values.hsnEnabled}
        onCheckedChange={(v) => setValue("hsnEnabled", v)}
      />
      {values.hsnEnabled && (
        <ToggleRow
          label="HSN code required"
          checked={values.hsnRequired}
          onCheckedChange={(v) => setValue("hsnRequired", v)}
        />
      )}

      <div className="space-y-1 pt-2">
        <p className="text-sm font-medium">Optional fields</p>
        <p className="text-xs text-muted-foreground">
          Turn on only what your business actually uses — everything else stays out of the way.
        </p>
      </div>
      <ToggleRow
        label="Description"
        checked={values.descriptionEnabled}
        onCheckedChange={(v) => setValue("descriptionEnabled", v)}
      />
      <ToggleRow label="MRP" checked={values.mrpEnabled} onCheckedChange={(v) => setValue("mrpEnabled", v)} />
      <ToggleRow
        label="Purchase price"
        description="Owner-only cost price — used for profit calculation."
        checked={values.purchasePriceEnabled}
        onCheckedChange={(v) => setValue("purchasePriceEnabled", v)}
      />
      <ToggleRow
        label="Wholesale price"
        description="A separate bulk-selling price, used automatically for Wholesale-category parties."
        checked={values.wholesalePriceEnabled}
        onCheckedChange={(v) => setValue("wholesalePriceEnabled", v)}
      />
      <ToggleRow
        label="Party-wise item price"
        description="Set a different selling price per customer/party for any product."
        checked={values.partyPricingEnabled}
        onCheckedChange={(v) => setValue("partyPricingEnabled", v)}
      />
      <ToggleRow
        label="Serial number"
        checked={values.serialNumberEnabled}
        onCheckedChange={(v) => setValue("serialNumberEnabled", v)}
      />
      <ToggleRow
        label="Batch number"
        description="Track batch number and expiry when receiving stock via Purchases."
        checked={values.batchNumberEnabled}
        onCheckedChange={(v) => setValue("batchNumberEnabled", v)}
      />
      <ToggleRow
        label="Barcode"
        description="Scan or enter a barcode, used for fast lookup in POS/Create Order."
        checked={values.barcodeEnabled}
        onCheckedChange={(v) => setValue("barcodeEnabled", v)}
      />
      <ToggleRow
        label="Item/Product type"
        checked={values.productTypeEnabled}
        onCheckedChange={(v) => setValue("productTypeEnabled", v)}
      />
      <ToggleRow
        label="Stock"
        description="Track stock quantity and reduce/restore it automatically on sales, purchases, and returns."
        checked={values.stockEnabled}
        onCheckedChange={(v) => setValue("stockEnabled", v)}
      />
      {values.stockEnabled && (
        <ToggleRow
          label="Allow selling below zero stock"
          description="Off by default — a sale won't take stock below 0 for products that track it."
          checked={values.allowNegativeStock}
          onCheckedChange={(v) => setValue("allowNegativeStock", v)}
        />
      )}
      <ToggleRow
        label="Product image"
        checked={values.productImageEnabled}
        onCheckedChange={(v) => setValue("productImageEnabled", v)}
      />
      <ToggleRow
        label="Product code"
        description='A unique code per product, e.g. "ITEM-001" — can be auto-generated.'
        checked={values.productCodeEnabled}
        onCheckedChange={(v) => setValue("productCodeEnabled", v)}
      />
      <ToggleRow
        label="Offer"
        description="Set a percentage or flat discount on a product — applied automatically at checkout."
        checked={values.offerEnabled}
        onCheckedChange={(v) => setValue("offerEnabled", v)}
      />

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Saving…" : "Save item settings"}
      </Button>
    </form>
  );

  if (bare) return formContent;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Item settings</CardTitle>
        <CardDescription>Choose which product fields your business actually needs.</CardDescription>
      </CardHeader>
      <CardContent>{formContent}</CardContent>
    </Card>
  );
}
