"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { customerLoginSchema, type CustomerLoginInput } from "@/lib/validation/customer-auth";
import { api, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldGroup } from "@/components/ui/field";
import { FormRow } from "@/components/shared/form-row";

export function CustomerLoginForm({
  slug,
  businessName,
  logoUrl,
}: {
  slug: string;
  businessName: string;
  logoUrl: string | null;
}) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Omit<CustomerLoginInput, "shopSlug">>({
    resolver: zodResolver(customerLoginSchema.omit({ shopSlug: true })),
  });

  async function onSubmit(values: Omit<CustomerLoginInput, "shopSlug">) {
    try {
      await api.post("/api/customer/auth/login", { ...values, shopSlug: slug });
      router.push(`/order/${slug}`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Login failed");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4 py-10">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3">
          {logoUrl ? (
            <Image
              src={logoUrl}
              alt={businessName}
              width={64}
              height={64}
              unoptimized
              className="rounded-2xl shadow-md ring-4 ring-background object-cover"
            />
          ) : null}
          <div className="space-y-0.5 text-center">
            <h1 className="text-xl font-bold tracking-tight">{businessName}</h1>
          </div>
        </div>

        <div className="rounded-2xl border bg-card shadow-md p-6 space-y-5">
          <div className="space-y-1">
            <h2 className="text-base font-semibold tracking-tight">Welcome back</h2>
            <p className="text-sm text-muted-foreground">Sign in to track and manage your orders.</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
            <FieldGroup>
              <FormRow label="Phone number" htmlFor="phone" required error={errors.phone}>
                <Input
                  id="phone"
                  inputMode="numeric"
                  autoComplete="username"
                  placeholder="91XXXXXXXXXX"
                  {...register("phone")}
                />
              </FormRow>
              <FormRow label="Password" htmlFor="password" required error={errors.password}>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  {...register("password")}
                />
              </FormRow>
            </FieldGroup>

            <Button
              type="submit"
              className="h-10 w-full bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm shadow-primary/20 transition-all"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            New here?{" "}
            <Link
              href={`/order/${slug}/signup`}
              className="font-medium text-primary hover:text-primary/80 underline underline-offset-4 transition-colors"
            >
              Create an account
            </Link>
          </p>
          <p className="text-center text-xs text-muted-foreground">
            <Link href={`/order/${slug}`} className="hover:text-foreground transition-colors">
              Continue as guest
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
