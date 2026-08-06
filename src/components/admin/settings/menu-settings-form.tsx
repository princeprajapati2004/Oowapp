"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { menuSettingsSchema, type MenuSettingsInput } from "@/lib/validation/shop-settings";
import { api, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { ToggleRow } from "@/components/shared/toggle-row";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export function MenuSettingsForm({
  defaultValues,
  bare,
}: {
  defaultValues: MenuSettingsInput;
  bare?: boolean;
}) {
  const {
    handleSubmit,
    watch,
    setValue,
    formState: { isSubmitting },
  } = useForm<MenuSettingsInput>({
    resolver: zodResolver(menuSettingsSchema),
    defaultValues,
  });

  const values = watch();

  async function onSubmit(data: MenuSettingsInput) {
    try {
      await api.patch("/api/admin/business", { section: "menu", ...data });
      toast.success("Menu display settings saved");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to save");
    }
  }

  const formContent = (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
      <ToggleRow
        label="Show product images"
        description="When disabled, product images are hidden in both the ordering panel and customer menu, making cards more compact."
        checked={values.showProductImages}
        onCheckedChange={(v) => setValue("showProductImages", v)}
      />

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Saving…" : "Save menu settings"}
      </Button>
    </form>
  );

  if (bare) return formContent;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Menu display</CardTitle>
        <CardDescription>Control what customers and staff see on the menu.</CardDescription>
      </CardHeader>
      <CardContent>{formContent}</CardContent>
    </Card>
  );
}
