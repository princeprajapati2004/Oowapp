"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { billNumberingSchema, type BillNumberingInput } from "@/lib/validation/shop-settings";
import { api, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormRow } from "@/components/shared/form-row";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export function BillNumberingForm({
  defaultValues,
  nextNumber,
  bare,
}: {
  defaultValues: BillNumberingInput;
  nextNumber: number;
  bare?: boolean;
}) {
  const [liveNextNumber, setLiveNextNumber] = useState(nextNumber);
  const [resetting, setResetting] = useState(false);
  const [resetValue, setResetValue] = useState("");
  const [saving, setSaving] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { isSubmitting },
  } = useForm<BillNumberingInput>({
    resolver: zodResolver(billNumberingSchema),
    defaultValues,
  });

  const prefix = watch("billNumberPrefix") || "";

  async function onSubmit(data: BillNumberingInput) {
    try {
      await api.patch("/api/admin/business", { section: "billNumbering", ...data });
      toast.success("Order prefix saved");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to save");
    }
  }

  function startReset() {
    setResetValue(String(liveNextNumber));
    setResetting(true);
  }

  async function handleResetSave() {
    const num = Number(resetValue);
    if (!Number.isFinite(num) || num <= 0) {
      toast.error("Enter a valid starting number");
      return;
    }
    setSaving(true);
    try {
      await api.patch("/api/admin/business", { section: "billNumberReset", billNumberNext: num });
      setLiveNextNumber(num);
      setResetting(false);
      toast.success("Next order number updated");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  }

  const formContent = (
    <div className="space-y-5">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
        <FormRow
          label="Order prefix"
          htmlFor="bill-number-prefix"
          description='Shown before every order/bill number, e.g. "OOWA-" → OOWA-1001. Leave blank for plain numbers.'
        >
          <Input id="bill-number-prefix" placeholder="OOWA-" maxLength={10} {...register("billNumberPrefix")} />
        </FormRow>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : "Save prefix"}
        </Button>
      </form>

      <div className="rounded-lg border p-3 space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Next order number</p>
        {resetting ? (
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={resetValue}
              onChange={(e) => setResetValue(e.target.value)}
              type="number"
              min={1}
              className="h-9 w-32"
              autoFocus
            />
            <Button size="sm" onClick={handleResetSave} disabled={saving}>
              {saving ? "Saving…" : "Update"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setResetting(false)} disabled={saving}>
              Cancel
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <p className="font-mono text-sm font-semibold">
              {prefix}
              {liveNextNumber}
            </p>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={startReset}>
              <Pencil className="size-3.5" /> Change starting number
            </Button>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          This is what the next order created will be numbered. Changing it only affects future orders — past bill
          numbers never change.
        </p>
      </div>
    </div>
  );

  if (bare) return formContent;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Order numbering</CardTitle>
        <CardDescription>Configure the prefix and sequence used for order/bill numbers.</CardDescription>
      </CardHeader>
      <CardContent>{formContent}</CardContent>
    </Card>
  );
}
