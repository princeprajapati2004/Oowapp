"use client";

import { FadeIn } from "./motion";
import { ShieldCheckIcon, ZapIcon, SmartphoneIcon, IndianRupeeIcon } from "lucide-react";

const signals = [
  {
    icon: ZapIcon,
    title: "Setup in minutes",
    desc: "No training or hardware needed",
  },
  {
    icon: SmartphoneIcon,
    title: "Works on every device",
    desc: "Phone, tablet, desktop — all covered",
  },
  {
    icon: ShieldCheckIcon,
    title: "Your data, your business",
    desc: "No marketplace. No middlemen",
  },
  {
    icon: IndianRupeeIcon,
    title: "Made in India",
    desc: "Built for local business realities",
  },
];

export function TrustBar() {
  return (
    <section className="border-y border-border/60 bg-muted/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <FadeIn
          direction="none"
          className="grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-6"
        >
          {signals.map((s) => (
            <div key={s.title} className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-primary/8 shrink-0 mt-0.5">
                <s.icon size={16} className="text-primary" />
              </div>
              <div>
                <div className="text-sm font-semibold text-foreground leading-tight mb-0.5">
                  {s.title}
                </div>
                <div className="text-xs text-muted-foreground leading-snug">
                  {s.desc}
                </div>
              </div>
            </div>
          ))}
        </FadeIn>
      </div>
    </section>
  );
}
