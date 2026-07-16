import { Switch } from "@/components/ui/switch";

interface ToggleRowProps {
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  id?: string;
}

export function ToggleRow({ label, description, checked, onCheckedChange, id }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border bg-card px-4 py-3 transition-colors hover:bg-muted/40">
      <div className="space-y-0.5">
        <label htmlFor={id} className="text-sm font-medium cursor-pointer select-none">
          {label}
        </label>
        {description ? <p className="text-xs text-muted-foreground leading-relaxed">{description}</p> : null}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}
