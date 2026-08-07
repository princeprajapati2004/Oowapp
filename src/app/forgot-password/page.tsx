"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormRow } from "@/components/shared/form-row";
import { api, ApiError } from "@/lib/api-client";

const schema = z.object({
  email: z.string().email("Enter a valid email address"),
});
type FormData = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [sent, setSent] = useState(false);
  const [sentEmail, setSentEmail] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormData) {
    try {
      await api.post("/api/auth/forgot-password", values);
      setSentEmail(values.email);
      setSent(true);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    }
  }

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4 py-10">
        <div className="w-full max-w-sm space-y-6">
          <div className="flex flex-col items-center gap-3">
            <Image src="/logo_1.webp" alt="OOWAPP" width={64} height={64} className="rounded-2xl ring-4 ring-background shadow-md" priority />
            <div className="space-y-0.5 text-center">
              <h1 className="text-xl font-bold tracking-tight">OOWAPP</h1>
              <p className="text-sm text-muted-foreground">Order on WhatsApp</p>
            </div>
          </div>
          <div className="rounded-2xl border bg-card shadow-md p-6 space-y-5">
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="size-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Mail className="size-5 text-primary" />
              </div>
              <div>
                <h2 className="text-base font-semibold">Check your inbox</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  If an account exists for <span className="font-medium text-foreground">{sentEmail}</span>, you&apos;ll receive a reset code shortly.
                </p>
              </div>
            </div>
            <Button
              className="w-full h-10"
              onClick={() => router.push(`/reset-password?email=${encodeURIComponent(sentEmail)}`)}
            >
              Enter reset code
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              <Link href="/login" className="text-primary hover:text-primary/80 font-medium inline-flex items-center gap-1">
                <ArrowLeft className="size-3.5" />
                Back to login
              </Link>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4 py-10">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3">
          <Image src="/logo_1.webp" alt="OOWAPP" width={64} height={64} className="rounded-2xl ring-4 ring-background shadow-md" priority />
          <div className="space-y-0.5 text-center">
            <h1 className="text-xl font-bold tracking-tight">OOWAPP</h1>
            <p className="text-sm text-muted-foreground">Order on WhatsApp</p>
          </div>
        </div>

        <div className="rounded-2xl border bg-card shadow-md p-6 space-y-5">
          <div className="space-y-1">
            <h2 className="text-base font-semibold tracking-tight">Forgot your password?</h2>
            <p className="text-sm text-muted-foreground">
              Enter your email address and we&apos;ll send you a reset code.
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <FormRow label="Email address" htmlFor="email" required error={errors.email}>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                autoFocus
                {...register("email")}
              />
            </FormRow>

            <Button type="submit" className="w-full h-10" disabled={isSubmitting}>
              {isSubmitting ? "Sending…" : "Send reset code"}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            <Link href="/login" className="text-primary hover:text-primary/80 font-medium inline-flex items-center gap-1.5">
              <ArrowLeft className="size-3.5" />
              Back to login
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
