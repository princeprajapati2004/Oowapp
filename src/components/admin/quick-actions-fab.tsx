"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, ShoppingBag, PackagePlus, Wallet, Users, type LucideIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

interface QuickAction {
  label: string;
  description: string;
  icon: LucideIcon;
  href: string;
}

// Launcher only — each destination is the app's existing full workflow, not a
// form embedded here. See create-order-page.tsx / products-manager.tsx /
// expenses-manager.tsx / parties-manager.tsx for the actual forms; the
// `?new=1` query param tells those managers to auto-open their existing
// "add" dialog on arrival (handled locally there, not via useSearchParams,
// so no Suspense boundary is required here).
const ACTIONS: QuickAction[] = [
  {
    label: "Create Order",
    description: "Create a new customer order and generate bill",
    icon: ShoppingBag,
    href: "/admin/orders/create",
  },
  {
    label: "Add Product",
    description: "Add a new menu item or product",
    icon: PackagePlus,
    href: "/admin/products?new=1",
  },
  {
    label: "Add Expense",
    description: "Record business expenses and payments",
    icon: Wallet,
    href: "/admin/expenses?new=1",
  },
  {
    label: "Add Party / Customer",
    description: "Add customer, supplier or business party",
    icon: Users,
    href: "/admin/parties?new=1",
  },
];

function QuickActionCards({ onSelect }: { onSelect: (href: string) => void }) {
  return (
    <div className="space-y-2.5 px-4 pb-4">
      {ACTIONS.map((action) => {
        const Icon = action.icon;
        return (
          <button
            key={action.label}
            type="button"
            onClick={() => onSelect(action.href)}
            className="flex min-h-11 w-full items-center gap-3 rounded-xl border bg-card px-4 py-3.5 text-left transition-colors hover:bg-muted/50 active:bg-muted"
          >
            <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <Icon className="size-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{action.label}</p>
              <p className="text-xs text-muted-foreground">{action.description}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function QuickActionsFab() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  // Bottom-sheet on mobile, centered modal on desktop/tablet — resolved via
  // matchMedia (not a CSS-only dual-render) so only one dialog primitive is
  // ever mounted at a time, avoiding stacked overlays/backdrops.
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 640px)");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsDesktop(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  function selectAction(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Quick Actions"
        className={cn(
          "fixed right-6 bottom-6 z-40 flex size-14 items-center justify-center rounded-full",
          "bg-emerald-600 text-white shadow-lg hover:bg-emerald-700",
          "transition-transform hover:scale-105 active:scale-95 print:hidden"
        )}
      >
        <Plus className="size-6" />
      </button>

      {isDesktop ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-h-[85vh] w-full max-w-[calc(100%-2rem)] gap-4 overflow-y-auto p-0 sm:max-w-[440px]">
            <DialogHeader className="px-4 pt-4">
              <DialogTitle>Quick Actions</DialogTitle>
              <DialogDescription>Choose what you want to add</DialogDescription>
            </DialogHeader>
            <QuickActionCards onSelect={selectAction} />
          </DialogContent>
        </Dialog>
      ) : (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-2xl">
            <SheetHeader>
              <SheetTitle>Quick Actions</SheetTitle>
              <SheetDescription>Choose what you want to add</SheetDescription>
            </SheetHeader>
            <QuickActionCards onSelect={selectAction} />
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}
