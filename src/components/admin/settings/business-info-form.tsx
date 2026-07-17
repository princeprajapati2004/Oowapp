"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { businessInfoSchema, type BusinessInfoInput } from "@/lib/validation/shop-settings";
import { BUSINESS_TYPES, BUSINESS_TYPE_LABELS } from "@/lib/business-types";
import { CURRENCIES } from "@/lib/currencies";
import { api, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FieldGroup } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormRow } from "@/components/shared/form-row";
import { ImageUploader } from "@/components/shared/image-uploader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export function BusinessInfoForm({
  defaultValues,
  bare,
}: {
  defaultValues: BusinessInfoInput;
  bare?: boolean;
}) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<BusinessInfoInput>({
    resolver: zodResolver(businessInfoSchema),
    defaultValues,
  });

  const businessType = watch("businessType");
  const currency = watch("currency");
  const logoUrl = watch("logoUrl");

  async function onSubmit(values: BusinessInfoInput) {
    try {
      await api.patch("/api/admin/business", { section: "business", ...values });
      toast.success("Business info saved");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to save");
    }
  }

  const formContent = (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <FormRow label="Logo" htmlFor="logoUrl">
        <ImageUploader value={logoUrl} onChange={(url) => setValue("logoUrl", url)} />
      </FormRow>

      <FieldGroup className="sm:grid sm:grid-cols-2 sm:gap-4 sm:space-y-0">
        <FormRow label="Business name" htmlFor="businessName" required error={errors.businessName}>
          <Input id="businessName" {...register("businessName")} />
        </FormRow>

        <FormRow label="Business type" htmlFor="businessType" required>
          <Select
            value={businessType}
            onValueChange={(v) => v && setValue("businessType", v as BusinessInfoInput["businessType"])}
          >
            <SelectTrigger id="businessType" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BUSINESS_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {BUSINESS_TYPE_LABELS[type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormRow>

        <FormRow label="Phone number" htmlFor="phone" error={errors.phone}>
          <Input id="phone" {...register("phone")} />
        </FormRow>

        <FormRow
          label="WhatsApp number"
          htmlFor="whatsappNumber"
          required
          description="Orders are sent here. Include country code."
          error={errors.whatsappNumber}
        >
          <Input id="whatsappNumber" inputMode="numeric" {...register("whatsappNumber")} />
        </FormRow>

        <FormRow label="GST number" htmlFor="gstNumber" error={errors.gstNumber}>
          <Input id="gstNumber" {...register("gstNumber")} />
        </FormRow>

        <FormRow label="Currency" htmlFor="currency" required>
          <Select value={currency} onValueChange={(v) => v && setValue("currency", v as BusinessInfoInput["currency"])}>
            <SelectTrigger id="currency" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormRow>
      </FieldGroup>

      <FormRow label="Address" htmlFor="address" error={errors.address}>
        <Textarea id="address" rows={2} {...register("address")} />
      </FormRow>

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Saving…" : "Save business info"}
      </Button>
    </form>
  );

  if (bare) return formContent;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Business info</CardTitle>
        <CardDescription>Shown on your menu page, bill, and printed QR.</CardDescription>
      </CardHeader>
      <CardContent>{formContent}</CardContent>
    </Card>
  );
}
