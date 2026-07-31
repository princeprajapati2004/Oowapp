"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, UtensilsCrossed, ShoppingBag, Bike, Footprints } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { label: "Dine-In", subtext: "Table service", icon: UtensilsCrossed, type: "DINE_IN" },
  { label: "Takeaway", subtext: "Pickup, no table", icon: ShoppingBag, type: "TAKEAWAY" },
  { label: "Delivery", subtext: "Deliver to address", icon: Bike, type: "DELIVERY" },
  // No distinct backend order type for walk-in — same state as Takeaway
  // (no table, no delivery address), see create-order-page.tsx.
  { label: "Walk-In", subtext: "Counter sale, no table", icon: Footprints, type: "TAKEAWAY" },
] as const;

export function CreateOrderFab() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  function selectType(type: string) {
    setOpen(false);
    router.push(`/admin/orders/create?type=${type}`);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Create Order"
        className={cn(
          "fixed right-6 bottom-6 z-40 flex size-14 items-center justify-center rounded-full",
          "bg-emerald-600 text-white shadow-lg hover:bg-emerald-700",
          "transition-transform hover:scale-105 active:scale-95 print:hidden"
        )}
      >
        <Plus className="size-6" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>Create New Order</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-4 space-y-2">
            {OPTIONS.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.label}
                  type="button"
                  onClick={() => selectType(option.type)}
                  className="flex w-full items-center gap-3 rounded-xl border bg-card px-4 py-3 text-left transition-colors hover:bg-muted/50"
                >
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <Icon className="size-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm">{option.label}</p>
                    <p className="text-xs text-muted-foreground">{option.subtext}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
