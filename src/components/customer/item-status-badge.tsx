import { cn } from "@/lib/utils";

export type ItemStatus = "new" | "ordered" | "included" | "paid";

const STATUS_CONFIG: Record<ItemStatus, { label: string; className: string }> = {
  new: {
    label: "New",
    className: "bg-muted text-muted-foreground border-border",
  },
  ordered: {
    label: "Ordered",
    className: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800",
  },
  included: {
    label: "Included in Bill",
    className: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/20 dark:text-violet-400 dark:border-violet-800",
  },
  paid: {
    label: "Paid",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800",
  },
};

export function ItemStatusBadge({ status, className }: { status: ItemStatus; className?: string }) {
  const config = STATUS_CONFIG[status];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-medium leading-none",
        config.className,
        className
      )}
    >
      {config.label}
    </span>
  );
}

/** A table session's items all move through the same billing lifecycle together
 * (one round doesn't get billed while another doesn't) — so status is derived
 * from the session as a whole rather than tracked per line item. */
export function sessionItemStatus(sessionStatus: string): ItemStatus {
  if (sessionStatus === "PAID") return "paid";
  if (sessionStatus === "AWAITING_PAYMENT") return "included";
  return "ordered";
}
