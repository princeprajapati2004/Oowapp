"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { loginSchema, type LoginInput } from "@/lib/validation/auth";
import { api, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldGroup } from "@/components/ui/field";
import { FormRow } from "@/components/shared/form-row";

export default function LoginPage() {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(values: LoginInput) {
    try {
      await api.post("/api/auth/login", values);
      router.push("/admin");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Login failed");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 px-4 py-10">
      <div className="w-full max-w-md bg-background border rounded-2xl shadow-sm p-6 sm:p-8 space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Admin login</h1>
          <p className="text-sm text-muted-foreground">Manage your menu, orders, and settings.</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <FieldGroup>
            <FormRow label="Email" htmlFor="email" required error={errors.email}>
              <Input id="email" type="email" placeholder="you@example.com" {...register("email")} />
            </FormRow>
            <FormRow label="Password" htmlFor="password" required error={errors.password}>
              <Input id="password" type="password" placeholder="••••••••" {...register("password")} />
            </FormRow>
          </FieldGroup>

          <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
            {isSubmitting ? "Logging in…" : "Log in"}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          New here?{" "}
          <Link href="/admin/signup" className="font-medium text-foreground underline underline-offset-4">
            Set up your shop
          </Link>
        </p>
      </div>
    </div>
  );
}
