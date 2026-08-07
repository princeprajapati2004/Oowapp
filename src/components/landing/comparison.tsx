"use client";

import { FadeIn } from "./motion";
import { CheckIcon, XIcon, MinusIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const rows = [
  { feature: "Easy setup (< 5 min)", oowapp: true, traditional: false, marketplace: "partial" },
  { feature: "Own your customer data", oowapp: true, traditional: false, marketplace: false },
  { feature: "Direct UPI payments", oowapp: true, traditional: false, marketplace: false },
  { feature: "No commission per order", oowapp: true, traditional: true, marketplace: false },
  { feature: "Live order dashboard", oowapp: true, traditional: false, marketplace: "partial" },
  { feature: "Digital bills & GST invoices", oowapp: true, traditional: false, marketplace: "partial" },
  { feature: "QR-based ordering", oowapp: true, traditional: false, marketplace: false },
  { feature: "Staff ordering support", oowapp: true, traditional: true, marketplace: false },
  { feature: "Your own brand & URL", oowapp: true, traditional: true, marketplace: false },
  { feature: "No expensive hardware", oowapp: true, traditional: false, marketplace: true },
  { feature: "Business analytics", oowapp: true, traditional: false, marketplace: "partial" },
];

type CellValue = boolean | "partial";

function Cell({ value }: { value: CellValue }) {
  if (value === true)
    return (
      <div className="flex justify-center">
        <span className="inline-flex size-6 rounded-full bg-primary/10 items-center justify-center">
          <CheckIcon size={13} className="text-primary font-bold" strokeWidth={3} />
        </span>
      </div>
    );
  if (value === "partial")
    return (
      <div className="flex justify-center">
        <span className="inline-flex size-6 rounded-full bg-muted items-center justify-center">
          <MinusIcon size={13} className="text-muted-foreground" strokeWidth={2.5} />
        </span>
      </div>
    );
  return (
    <div className="flex justify-center">
      <span className="inline-flex size-6 rounded-full bg-destructive/8 items-center justify-center">
        <XIcon size={12} className="text-destructive/70" strokeWidth={2.5} />
      </span>
    </div>
  );
}

export function ComparisonSection() {
  return (
    <section className="py-24 lg:py-32">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <FadeIn className="text-center mb-16">
          <span className="text-xs font-semibold uppercase tracking-widest text-primary mb-3 block">
            Why Oowapp
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
            The smarter choice for your business
          </h2>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto">
            Compare Oowapp with running things manually or joining a marketplace
            platform.
          </p>
        </FadeIn>

        <FadeIn>
          <div className="rounded-2xl border border-border/70 overflow-hidden bg-card shadow-sm">
            {/* Table header */}
            <div className="grid grid-cols-[1fr_120px_120px_120px] bg-muted/30 border-b border-border/60">
              <div className="px-5 py-4" />
              <div className="px-3 py-4 text-center">
                <div className="text-xs font-bold uppercase tracking-wide text-primary">
                  Oowapp
                </div>
              </div>
              <div className="px-3 py-4 text-center">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Traditional
                </div>
              </div>
              <div className="px-3 py-4 text-center">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Marketplace
                </div>
              </div>
            </div>

            {/* Rows */}
            {rows.map((row, i) => (
              <div
                key={row.feature}
                className={cn(
                  "grid grid-cols-[1fr_120px_120px_120px] items-center border-b border-border/40 last:border-0 transition-colors",
                  "hover:bg-muted/20"
                )}
              >
                <div className="px-5 py-3.5 text-sm font-medium">
                  {row.feature}
                </div>
                <div className="px-3 py-3.5">
                  <Cell value={row.oowapp} />
                </div>
                <div className="px-3 py-3.5">
                  <Cell value={row.traditional as CellValue} />
                </div>
                <div className="px-3 py-3.5">
                  <Cell value={row.marketplace as CellValue} />
                </div>
              </div>
            ))}
          </div>

          <p className="mt-4 text-xs text-muted-foreground text-center">
            — = Partially available or limited
          </p>
        </FadeIn>
      </div>
    </section>
  );
}
