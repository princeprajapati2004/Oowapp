"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChefHat } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormRow } from "@/components/shared/form-row";
import { api, ApiError } from "@/lib/api-client";

export default function StaffLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [shopSlug, setShopSlug] = useState(searchParams.get("shop") ?? "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!shopSlug.trim() || !email.trim() || !password) {
      toast.error("Please fill in all fields");
      return;
    }
    setLoading(true);
    try {
      const res = await api.post<{ ok: boolean; role: string; shopSlug: string }>(
        "/api/staff/auth/login",
        { shopSlug: shopSlug.trim(), email: email.trim(), password }
      );
      if (res.ok) {
        if (res.role === "KITCHEN") {
          router.push("/kitchen");
        } else if (res.role === "WAITER" || res.role === "MANAGER") {
          router.push("/admin/counter");
        } else {
          router.push("/admin");
        }
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/20 px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10">
            <ChefHat className="size-6 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Staff Login</h1>
          <p className="text-sm text-muted-foreground">Sign in with your staff credentials</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border bg-card p-6 shadow-sm">
          <FormRow label="Restaurant ID" htmlFor="shopSlug" required>
            <Input
              id="shopSlug"
              placeholder="your-restaurant"
              value={shopSlug}
              onChange={(e) => setShopSlug(e.target.value)}
              autoComplete="off"
            />
          </FormRow>

          <FormRow label="Email" htmlFor="email" required>
            <Input
              id="email"
              type="email"
              placeholder="staff@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </FormRow>

          <FormRow label="Password" htmlFor="password" required>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </FormRow>

          <Button type="submit" className="h-11 w-full" disabled={loading}>
            {loading ? "Signing in…" : "Sign In"}
          </Button>
        </form>
      </div>
    </div>
  );
}
