"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { orderSettingsSchema, type OrderSettingsInput } from "@/lib/validation/shop-settings";
import { api, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { ToggleRow } from "@/components/shared/toggle-row";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export function OrderSettingsForm({ defaultValues }: { defaultValues: OrderSettingsInput }) {
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Order settings</CardTitle>
        <CardDescription>Choose what customers must fill in before checkout.</CardDescription>
      </CardHeader>
      <CardContent>
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
          <ToggleRow
            label="Require table number"
            checked={values.requireTableNumber}
            onCheckedChange={(v) => setValue("requireTableNumber", v)}
          />
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

          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : "Save order settings"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
