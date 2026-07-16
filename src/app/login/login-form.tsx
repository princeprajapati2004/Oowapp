"use client";

import Image from "next/image";
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
import { InstallApp } from "@/components/shared/install-app";

export function LoginForm() {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(values: LoginInput) {
    try {
      const res = await api.post<{ role: string; shopSlug?: string }>(
        "/api/auth/login",
        values
      );
      if (res.role === "super_admin") {
        router.push("/super-admin");
      } else {
        router.push("/admin");
      }
      router.refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Login failed");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4 py-10">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3">
          <Image
            src="/logo_1.webp"
            alt="OOWAPP"
            width={72}
            height={72}
            className="rounded-2xl shadow-md ring-4 ring-background"
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
            <h2 className="text-base font-semibold tracking-tight">Welcome back</h2>
            <p className="text-sm text-muted-foreground">Sign in to manage your shop.</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
            <FieldGroup>
              <FormRow label="Email" htmlFor="email" required error={errors.email}>
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  placeholder="you@example.com"
                  {...register("email")}
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
              href="/admin/signup"
              className="font-medium text-primary hover:text-primary/80 underline underline-offset-4 transition-colors"
            >
              Set up your shop
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
