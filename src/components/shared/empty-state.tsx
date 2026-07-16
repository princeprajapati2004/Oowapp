import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed bg-muted/20 py-14 text-center px-6">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-muted">
        <Icon className="size-7 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <p className="font-semibold text-sm">{title}</p>
        {description ? (
          <p className="max-w-xs text-sm text-muted-foreground leading-relaxed">{description}</p>
        ) : null}
      </div>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}
