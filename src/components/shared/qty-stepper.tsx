"use client";

import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface QtyStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  size?: "sm" | "default";
}

export function QtyStepper({ value, onChange, min = 1, max = 99, size = "default" }: QtyStepperProps) {
  const isDefault = size === "default";
  return (
    <div className="inline-flex items-center rounded-full bg-muted">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={isDefault ? "size-8 rounded-full hover:bg-muted-foreground/15" : "size-7 rounded-full hover:bg-muted-foreground/15"}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        aria-label="Decrease quantity"
      >
        <Minus className={isDefault ? "size-3.5" : "size-3"} />
      </Button>
      <span className={`text-center font-semibold tabular-nums select-none ${isDefault ? "w-8 text-sm" : "w-6 text-xs"}`}>{value}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={isDefault ? "size-8 rounded-full hover:bg-muted-foreground/15" : "size-7 rounded-full hover:bg-muted-foreground/15"}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        aria-label="Increase quantity"
      >
        <Plus className={isDefault ? "size-3.5" : "size-3"} />
      </Button>
    </div>
  );
}
