"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { registerStartSchema, type RegisterStartInput } from "@/lib/validation/auth";
import { api, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldGroup } from "@/components/ui/field";
import { FormRow } from "@/components/shared/form-row";
import { InstallApp } from "@/components/shared/install-app";

export default function SignupPage() {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterStartInput>({
    resolver: zodResolver(registerStartSchema),
  });

  async function onSubmit(values: RegisterStartInput) {
    try {
      await api.post<{ pendingVerification: boolean; email: string }>("/api/auth/signup", values);
      router.push(`/verify-email?email=${encodeURIComponent(values.email)}`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Registration failed");
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
            <h1 className="text-xl font-bold tracking-tight">OOWAPP</h1>
            <p className="text-sm text-muted-foreground">Order on WhatsApp</p>
          </div>
          <InstallApp alwaysShow />
        </div>

        <div className="rounded-2xl border bg-card shadow-md p-6 space-y-5">
          <div className="space-y-1">
            <h2 className="text-base font-semibold tracking-tight">Set up your shop</h2>
            <p className="text-sm text-muted-foreground">
              Enter your phone and email to get started — no password needed.
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
            <FieldGroup>
              <FormRow
                label="Phone number"
                htmlFor="phone"
                required
                description="Include country code, e.g. 91XXXXXXXXXX"
                error={errors.phone}
              >
                <Input id="phone" inputMode="numeric" placeholder="91XXXXXXXXXX" {...register("phone")} />
              </FormRow>

              <FormRow label="Email" htmlFor="email" required error={errors.email}>
                <Input id="email" type="email" placeholder="you@example.com" {...register("email")} />
              </FormRow>
            </FieldGroup>

            <Button
              type="submit"
              className="h-10 w-full bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm shadow-primary/20 transition-all"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Sending code…" : "Continue"}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            Already have a shop?{" "}
            <Link
              href="/login"
              className="font-medium text-primary hover:text-primary/80 underline underline-offset-4 transition-colors"
            >
              Log in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
