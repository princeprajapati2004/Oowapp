"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  paymentSettingsSchema,
  type PaymentSettingsInput,
} from "@/lib/validation/shop-settings";
import { api, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldGroup } from "@/components/ui/field";
import { FormRow } from "@/components/shared/form-row";
import { ImageUploader } from "@/components/shared/image-uploader";
import { ToggleRow } from "@/components/shared/toggle-row";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export function PaymentSettingsForm({
  defaultValues,
  bare,
}: {
  defaultValues: PaymentSettingsInput;
  bare?: boolean;
}) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<PaymentSettingsInput>({
    resolver: zodResolver(paymentSettingsSchema),
    defaultValues,
  });

  const acceptCash = watch("acceptCash");
  const paymentQrImageUrl = watch("paymentQrImageUrl");

  async function onSubmit(values: PaymentSettingsInput) {
    try {
      await api.patch("/api/admin/business", { section: "payment", ...values });
      toast.success("Payment settings saved");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to save");
    }
  }

  const formContent = (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <FieldGroup className="sm:grid sm:grid-cols-2 sm:gap-4 sm:space-y-0">
        <FormRow label="UPI ID" htmlFor="upiId" description="e.g. yourshop@upi" error={errors.upiId}>
          <Input id="upiId" {...register("upiId")} />
        </FormRow>
        <FormRow label="Bank name" htmlFor="bankName" error={errors.bankName}>
          <Input id="bankName" {...register("bankName")} />
        </FormRow>
        <FormRow label="Account holder name" htmlFor="bankAccountName" error={errors.bankAccountName}>
          <Input id="bankAccountName" {...register("bankAccountName")} />
        </FormRow>
        <FormRow label="Account number" htmlFor="bankAccountNumber" error={errors.bankAccountNumber}>
          <Input id="bankAccountNumber" {...register("bankAccountNumber")} />
        </FormRow>
        <FormRow label="IFSC code" htmlFor="bankIfsc" error={errors.bankIfsc}>
          <Input id="bankIfsc" {...register("bankIfsc")} />
        </FormRow>
      </FieldGroup>

      <FormRow
        label="Payment QR image"
        htmlFor="paymentQrImageUrl"
        description="Upload your GPay / PhonePe / Paytm QR to show it on the bill."
      >
        <ImageUploader
          value={paymentQrImageUrl}
          onChange={(url) => setValue("paymentQrImageUrl", url)}
        />
      </FormRow>

      <ToggleRow
        id="acceptCash"
        label="Accept cash"
        description={'Show "Cash accepted" on the bill.'}
        checked={acceptCash}
        onCheckedChange={(v) => setValue("acceptCash", v)}
      />

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Saving…" : "Save payment settings"}
      </Button>
    </form>
  );

  if (bare) return formContent;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment settings</CardTitle>
        <CardDescription>Shown to customers on the bill so they know how to pay.</CardDescription>
      </CardHeader>
      <CardContent>{formContent}</CardContent>
    </Card>
  );
}
