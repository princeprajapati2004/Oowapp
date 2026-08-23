"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { businessDetailsSchema, type BusinessDetailsInput } from "@/lib/validation/auth";
import { BUSINESS_TYPES, BUSINESS_TYPE_LABELS } from "@/lib/business-types";
import { api, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldGroup } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormRow } from "@/components/shared/form-row";

export function BusinessDetailsForm() {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<BusinessDetailsInput>({
    resolver: zodResolver(businessDetailsSchema),
    defaultValues: { businessType: "RESTAURANT" },
  });

  const businessType = watch("businessType");

  async function onSubmit(values: BusinessDetailsInput) {
    try {
      await api.post<{ shopSlug: string }>("/api/auth/complete-registration", values);
      toast.success("Your shop is ready!");
      router.push("/admin");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not complete registration");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4 py-10">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3">
          <Image
            src="/logo_1.webp"
            alt="OOWAPP"
            width={64}
            height={64}
            className="rounded-2xl ring-4 ring-background shadow-md"
            priority
          />
          <div className="space-y-0.5 text-center">
            <h1 className="text-xl font-bold tracking-tight">Tell us about your business</h1>
            <p className="text-sm text-muted-foreground">Almost done — just a couple more details.</p>
          </div>
        </div>

        <div className="rounded-2xl border bg-card shadow-md p-6 space-y-5">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
            <FieldGroup>
              <FormRow label="Business name" htmlFor="businessName" required error={errors.businessName}>
                <Input
                  id="businessName"
                  placeholder="e.g. Heritage Kitchen"
                  {...register("businessName")}
                />
              </FormRow>

              <FormRow label="Business type" htmlFor="businessType" required>
                <Select
                  value={businessType}
                  onValueChange={(v) => v && setValue("businessType", v as BusinessDetailsInput["businessType"])}
                >
                  <SelectTrigger id="businessType" className="w-full">
                    <SelectValue placeholder="Select a business type" />
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
            </FieldGroup>

            <Button
              type="submit"
              className="h-10 w-full bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm shadow-primary/20 transition-all"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Creating your shop…" : "Complete registration"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
