"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { api, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Coupon {
  id: string;
  code: string;
  discountType: "PERCENTAGE" | "FIXED";
  discountValue: number;
  maxDiscountAmount: number | null;
  minAmount: number | null;
  applicablePlanCodes: string[];
  startsAt: string | null;
  expiresAt: string | null;
  totalUsageLimit: number | null;
  perAdminLimit: number | null;
  usageCount: number;
  isActive: boolean;
}

export function CouponManager({ coupons }: { coupons: Coupon[] }) {
  const router = useRouter();

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <NewCouponDialog onCreated={() => router.refresh()} />
      </div>
      <Card>
        <CardContent className="p-0">
          {coupons.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">No coupons yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="px-3 py-2 text-left">Code</th>
                    <th className="px-3 py-2 text-left">Discount</th>
                    <th className="px-3 py-2 text-left">Plans</th>
                    <th className="px-3 py-2 text-left">Usage</th>
                    <th className="px-3 py-2 text-left">Expires</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {coupons.map((c) => (
                    <tr key={c.id}>
                      <td className="px-3 py-2 font-medium">{c.code}</td>
                      <td className="px-3 py-2">
                        {c.discountType === "PERCENTAGE" ? `${c.discountValue}%` : `₹${c.discountValue}`}
                        {c.maxDiscountAmount !== null && c.discountType === "PERCENTAGE" && (
                          <span className="text-muted-foreground"> (max ₹{c.maxDiscountAmount})</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {c.applicablePlanCodes.length === 0 ? "All plans" : c.applicablePlanCodes.join(", ")}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {c.usageCount}
                        {c.totalUsageLimit !== null ? ` / ${c.totalUsageLimit}` : ""}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                        {c.expiresAt ? new Date(c.expiresAt).toLocaleDateString() : "—"}
                      </td>
                      <td className="px-3 py-2">
                        {c.isActive ? <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">Active</Badge> : <Badge variant="outline">Disabled</Badge>}
                      </td>
                      <td className="px-3 py-2">
                        <ToggleActiveButton coupon={c} onSaved={() => router.refresh()} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ToggleActiveButton({ coupon, onSaved }: { coupon: Coupon; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  async function handleClick() {
    setSaving(true);
    try {
      await api.patch(`/api/super-admin/subscription-coupons/${coupon.id}`, { isActive: !coupon.isActive });
      toast.success(coupon.isActive ? "Coupon disabled." : "Coupon enabled.");
      onSaved();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to update coupon");
    } finally {
      setSaving(false);
    }
  }
  return (
    <Button variant="outline" size="sm" disabled={saving} onClick={handleClick}>
      {coupon.isActive ? "Disable" : "Enable"}
    </Button>
  );
}

function NewCouponDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState<"PERCENTAGE" | "FIXED">("PERCENTAGE");
  const [discountValue, setDiscountValue] = useState("");
  const [maxDiscountAmount, setMaxDiscountAmount] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [applicablePlanCodes, setApplicablePlanCodes] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [totalUsageLimit, setTotalUsageLimit] = useState("");
  const [perAdminLimit, setPerAdminLimit] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    setSaving(true);
    try {
      await api.post("/api/super-admin/subscription-coupons", {
        code: code.trim().toUpperCase(),
        discountType,
        discountValue: Number(discountValue),
        maxDiscountAmount: maxDiscountAmount ? Number(maxDiscountAmount) : undefined,
        minAmount: minAmount ? Number(minAmount) : undefined,
        applicablePlanCodes: applicablePlanCodes
          .split(",")
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean),
        expiresAt: expiresAt || undefined,
        totalUsageLimit: totalUsageLimit ? Number(totalUsageLimit) : undefined,
        perAdminLimit: perAdminLimit ? Number(perAdminLimit) : undefined,
      });
      toast.success("Coupon created.");
      setOpen(false);
      setCode("");
      setDiscountValue("");
      onCreated();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to create coupon");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <Plus className="size-4" />
        New Coupon
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Coupon</DialogTitle>
          <DialogDescription>e.g. OOWAPP50 — 50% off, max ₹500.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field>
            <FieldLabel>Code</FieldLabel>
            <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="OOWAPP50" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel>Discount type</FieldLabel>
              <Select value={discountType} onValueChange={(v) => v && setDiscountType(v as "PERCENTAGE" | "FIXED")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PERCENTAGE">Percentage</SelectItem>
                  <SelectItem value="FIXED">Fixed amount</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Value</FieldLabel>
              <Input type="number" min="0" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} placeholder={discountType === "PERCENTAGE" ? "50" : "100"} />
            </Field>
          </div>
          {discountType === "PERCENTAGE" && (
            <Field>
              <FieldLabel>Max discount amount (optional)</FieldLabel>
              <Input type="number" min="0" value={maxDiscountAmount} onChange={(e) => setMaxDiscountAmount(e.target.value)} placeholder="500" />
            </Field>
          )}
          <Field>
            <FieldLabel>Minimum order amount (optional)</FieldLabel>
            <Input type="number" min="0" value={minAmount} onChange={(e) => setMinAmount(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel>Applicable plans (comma-separated codes, blank = all)</FieldLabel>
            <Input value={applicablePlanCodes} onChange={(e) => setApplicablePlanCodes(e.target.value)} placeholder="MOON_STAR, SUPER_STAR" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel>Total usage limit</FieldLabel>
              <Input type="number" min="0" value={totalUsageLimit} onChange={(e) => setTotalUsageLimit(e.target.value)} placeholder="Unlimited" />
            </Field>
            <Field>
              <FieldLabel>Per-owner limit</FieldLabel>
              <Input type="number" min="0" value={perAdminLimit} onChange={(e) => setPerAdminLimit(e.target.value)} placeholder="Unlimited" />
            </Field>
          </div>
          <Field>
            <FieldLabel>Expires (optional)</FieldLabel>
            <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button disabled={!code.trim() || !discountValue || saving} onClick={handleSubmit}>
            {saving ? "Creating…" : "Create Coupon"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
