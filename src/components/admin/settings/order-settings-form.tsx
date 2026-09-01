"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { orderSettingsSchema, RETURN_WINDOW_DAY_PRESETS, type OrderSettingsInput } from "@/lib/validation/shop-settings";
import { api, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleRow } from "@/components/shared/toggle-row";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const CUSTOM_SENTINEL = "custom";

export function OrderSettingsForm({
  defaultValues,
  bare,
}: {
  defaultValues: OrderSettingsInput;
  bare?: boolean;
}) {
  const {
    handleSubmit,
    watch,
    setValue,
    formState: { isSubmitting },
  } = useForm<OrderSettingsInput>({
    resolver: zodResolver(orderSettingsSchema),
    defaultValues,
  });

  const values = watch();

  async function onSubmit(data: OrderSettingsInput) {
    try {
      await api.patch("/api/admin/business", { section: "orders", ...data });
      toast.success("Order settings saved");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to save");
    }
  }

  const formContent = (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
      <ToggleRow
        label="Require customer name"
        checked={values.requireCustomerName}
        onCheckedChange={(v) => setValue("requireCustomerName", v)}
      />
      <ToggleRow
        label="Require phone number"
        checked={values.requirePhone}
        onCheckedChange={(v) => setValue("requirePhone", v)}
      />
      {values.requirePhone && (
        <ToggleRow
          label="Verify phone number with OTP"
          description="Customers must confirm their phone number with a one-time code (via MSG91) before placing an order. Off by default — the phone number is still collected either way."
          checked={values.requirePhoneVerification}
          onCheckedChange={(v) => setValue("requirePhoneVerification", v)}
        />
      )}
      <ToggleRow
        label="Enable table number"
        description="Show a table number field during checkout. Disable for delivery, pickup, or retail businesses."
        checked={values.enableTableNumber}
        onCheckedChange={(v) => setValue("enableTableNumber", v)}
      />
      {values.enableTableNumber && (
        <ToggleRow
          label="Require table number"
          description="Make table number mandatory — customers cannot skip it."
          checked={values.requireTableNumber}
          onCheckedChange={(v) => setValue("requireTableNumber", v)}
        />
      )}
      <ToggleRow
        label="Require delivery address"
        checked={values.requireDeliveryAddress}
        onCheckedChange={(v) => setValue("requireDeliveryAddress", v)}
      />
      <ToggleRow
        label="Allow special instructions / notes"
        checked={values.allowNotes}
        onCheckedChange={(v) => setValue("allowNotes", v)}
      />
      <ToggleRow
        label="Save orders to database"
        description="Keep a log of orders in /admin/orders. Off by default — orders always go to WhatsApp either way."
        checked={values.saveOrdersToDb}
        onCheckedChange={(v) => setValue("saveOrdersToDb", v)}
      />
      <ToggleRow
        label="Menu is live"
        description="Turn off to temporarily hide your ordering page from customers."
        checked={values.isPublished}
        onCheckedChange={(v) => setValue("isPublished", v)}
      />
      <ToggleRow
        label="Enable barcode labels for orders"
        description="Adds a Print Barcode button on each order — one barcode label per item, for attaching to parcels."
        checked={values.enableOrderBarcodeLabels}
        onCheckedChange={(v) => setValue("enableOrderBarcodeLabels", v)}
      />
      <ToggleRow
        label="Enable QR ordering"
        description="When disabled, customers scanning QR codes see a staff-only message and cannot place orders."
        checked={values.enableQrOrdering}
        onCheckedChange={(v) => setValue("enableQrOrdering", v)}
      />

      <div className="space-y-3 rounded-lg border p-3">
        <p className="text-sm font-semibold">Sales Return Policy</p>
        <ToggleRow
          label="Enable customer returns"
          description="Let customers self-service a return from their order details page."
          checked={values.returnPolicyEnabled}
          onCheckedChange={(v) => setValue("returnPolicyEnabled", v)}
        />
        {values.returnPolicyEnabled && (
          <div className="space-y-1.5">
            <Label className="text-xs">Return allowed within</Label>
            <Select
              value={
                RETURN_WINDOW_DAY_PRESETS.includes(values.returnWindowDays as (typeof RETURN_WINDOW_DAY_PRESETS)[number])
                  ? String(values.returnWindowDays)
                  : CUSTOM_SENTINEL
              }
              onValueChange={(v) => {
                if (!v) return;
                if (v !== CUSTOM_SENTINEL) setValue("returnWindowDays", Number(v));
              }}
            >
              <SelectTrigger className="w-full sm:w-56">
                <SelectValue>
                  {RETURN_WINDOW_DAY_PRESETS.includes(values.returnWindowDays as (typeof RETURN_WINDOW_DAY_PRESETS)[number])
                    ? `${values.returnWindowDays} ${values.returnWindowDays === 1 ? "Day" : "Days"}`
                    : "Custom Days"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {RETURN_WINDOW_DAY_PRESETS.map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    {d} {d === 1 ? "Day" : "Days"}
                  </SelectItem>
                ))}
                <SelectItem value={CUSTOM_SENTINEL}>Custom Days</SelectItem>
              </SelectContent>
            </Select>
            {!RETURN_WINDOW_DAY_PRESETS.includes(values.returnWindowDays as (typeof RETURN_WINDOW_DAY_PRESETS)[number]) && (
              <Input
                type="number"
                min={1}
                max={365}
                value={values.returnWindowDays}
                onChange={(e) => setValue("returnWindowDays", Number(e.target.value) || 1)}
                className="w-full sm:w-56"
              />
            )}
            <p className="text-xs text-muted-foreground">After this period, customers cannot request a return.</p>
          </div>
        )}
      </div>

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Saving…" : "Save order settings"}
      </Button>
    </form>
  );

  if (bare) return formContent;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Order settings</CardTitle>
        <CardDescription>Choose what customers must fill in before checkout.</CardDescription>
      </CardHeader>
      <CardContent>{formContent}</CardContent>
    </Card>
  );
}
