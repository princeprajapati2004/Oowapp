"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  paymentGatewaySchema,
  type PaymentGatewaySettingsInput,
} from "@/lib/validation/shop-settings";
import { api, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldGroup } from "@/components/ui/field";
import { FormRow } from "@/components/shared/form-row";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export function PaymentGatewaySettingsForm({
  defaultValues,
  bare,
}: {
  defaultValues: PaymentGatewaySettingsInput;
  bare?: boolean;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PaymentGatewaySettingsInput>({
    resolver: zodResolver(paymentGatewaySchema),
    defaultValues,
  });

  async function onSubmit(values: PaymentGatewaySettingsInput) {
    try {
      await api.patch("/api/admin/business", { section: "payment_gateway", ...values });
      toast.success("Payment gateway settings saved");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to save");
    }
  }

  const formContent = (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <FieldGroup className="sm:grid sm:grid-cols-2 sm:gap-4 sm:space-y-0">
        <FormRow
          label="Account ID"
          htmlFor="paymentGatewayAccountId"
          description="Razorpay linked account ID (starts with acc_)."
          error={errors.paymentGatewayAccountId}
        >
          <Input
            id="paymentGatewayAccountId"
            placeholder="acc_XXXXXXXXXXXXXX"
            {...register("paymentGatewayAccountId")}
          />
        </FormRow>
        <FormRow
          label="MID"
          htmlFor="paymentGatewayMerchantId"
          description="Merchant ID for this linked account."
          error={errors.paymentGatewayMerchantId}
        >
          <Input
            id="paymentGatewayMerchantId"
            placeholder="XXXXXXXXXXXXXX"
            {...register("paymentGatewayMerchantId")}
          />
        </FormRow>
      </FieldGroup>

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Saving…" : "Save payment gateway settings"}
      </Button>
    </form>
  );

  if (bare) return formContent;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment gateway</CardTitle>
        <CardDescription>Linked account used to collect customer-order payments.</CardDescription>
      </CardHeader>
      <CardContent>{formContent}</CardContent>
    </Card>
  );
}
