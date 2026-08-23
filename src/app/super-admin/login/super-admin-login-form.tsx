"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { z } from "zod";
import { api, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldGroup } from "@/components/ui/field";
import { FormRow } from "@/components/shared/form-row";

const schema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});
type FormInput = z.infer<typeof schema>;

export function SuperAdminLoginForm() {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormInput>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormInput) {
    try {
      await api.post("/api/super-admin/auth/login", values);
      router.push("/super-admin");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Login failed");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4 py-10">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-0.5">
          <h1 className="text-xl font-bold tracking-tight">OOWAPP</h1>
          <p className="text-sm text-muted-foreground">Super Admin</p>
        </div>

        <div className="rounded-2xl border bg-card shadow-md p-6 space-y-5">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
            <FieldGroup>
              <FormRow label="Email" htmlFor="sa-email" required error={errors.email}>
                <Input id="sa-email" type="email" autoComplete="username" {...register("email")} />
              </FormRow>
              <FormRow label="Password" htmlFor="sa-password" required error={errors.password}>
                <Input id="sa-password" type="password" autoComplete="current-password" {...register("password")} />
              </FormRow>
            </FieldGroup>
            <Button type="submit" className="h-10 w-full" disabled={isSubmitting}>
              {isSubmitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
