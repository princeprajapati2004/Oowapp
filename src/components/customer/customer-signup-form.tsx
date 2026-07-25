"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { customerSignupSchema, type CustomerSignupInput } from "@/lib/validation/customer-auth";
import { api, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldGroup } from "@/components/ui/field";
import { FormRow } from "@/components/shared/form-row";

export function CustomerSignupForm({
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
  } = useForm<Omit<CustomerSignupInput, "shopSlug">>({
    resolver: zodResolver(customerSignupSchema.omit({ shopSlug: true })),
  });

  async function onSubmit(values: Omit<CustomerSignupInput, "shopSlug">) {
    try {
      await api.post("/api/customer/auth/signup", { ...values, shopSlug: slug });
      router.push(`/order/${slug}`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Signup failed");
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
            <h2 className="text-base font-semibold tracking-tight">Create an account</h2>
            <p className="text-sm text-muted-foreground">Track your orders and check out faster next time.</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
            <FieldGroup>
              <FormRow label="Name" htmlFor="name" required error={errors.name}>
                <Input id="name" placeholder="Your name" {...register("name")} />
              </FormRow>
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
                  autoComplete="new-password"
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
              {isSubmitting ? "Creating account…" : "Create account"}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link
              href={`/order/${slug}/login`}
              className="font-medium text-primary hover:text-primary/80 underline underline-offset-4 transition-colors"
            >
              Sign in
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
