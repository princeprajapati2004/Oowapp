import Link from "next/link";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

// Reusable "this needs a higher plan" state — used both as a full-page placeholder
// (unbuilt modules like E-Invoicing/Tally Export/Godowns, see feature-placeholder-page.tsx)
// and inline wherever a specific action is gated. Never hides the fact that the
// feature exists — just explains what unlocks it.
export function FeatureLock({
  label,
  description,
  className,
}: {
  label: string;
  description?: string;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-10 text-center ${className ?? ""}`}>
      <Lock className="size-8 text-muted-foreground" />
      <h3 className="text-lg font-semibold">🔒 {label}</h3>
      <p className="max-w-sm text-sm text-muted-foreground">{description ?? "Available on a higher plan."}</p>
      <Button render={<Link href="/admin/subscription" />}>Upgrade Plan</Button>
    </div>
  );
}
