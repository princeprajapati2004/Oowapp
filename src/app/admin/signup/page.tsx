"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { signupSchema, type SignupInput } from "@/lib/validation/auth";
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

export default function SignupPage() {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    defaultValues: { businessType: "RESTAURANT" },
  });

  const businessType = watch("businessType");

  async function onSubmit(values: SignupInput) {
    try {
      const res = await api.post<{ shopSlug: string }>("/api/auth/signup", values);
      toast.success("Your shop is ready!");
      router.push("/admin");
      router.refresh();
      void res;
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Signup failed");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 px-4 py-10">
      <div className="w-full max-w-md bg-background border rounded-2xl shadow-sm p-6 sm:p-8 space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Set up your shop</h1>
          <p className="text-sm text-muted-foreground">
            Create your free ordering page in under a minute.
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
                onValueChange={(v) => v && setValue("businessType", v as SignupInput["businessType"])}
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

            <FormRow
              label="WhatsApp number"
              htmlFor="whatsappNumber"
              required
              description="Include country code, e.g. 91XXXXXXXXXX — orders will be sent here."
              error={errors.whatsappNumber}
            >
              <Input
                id="whatsappNumber"
                inputMode="numeric"
                placeholder="91XXXXXXXXXX"
                {...register("whatsappNumber")}
              />
            </FormRow>

            <FormRow label="Email" htmlFor="email" required error={errors.email}>
              <Input id="email" type="email" placeholder="you@example.com" {...register("email")} />
            </FormRow>

            <FormRow label="Password" htmlFor="password" required error={errors.password}>
              <Input id="password" type="password" placeholder="••••••••" {...register("password")} />
            </FormRow>
          </FieldGroup>

          <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
            {isSubmitting ? "Creating your shop…" : "Create my shop"}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Already have a shop?{" "}
          <Link href="/login" className="font-medium text-foreground underline underline-offset-4">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
