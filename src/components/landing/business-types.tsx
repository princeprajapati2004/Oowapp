"use client";

import { FadeIn, motion } from "./motion";
import { useRef } from "react";
import { useInView } from "framer-motion";
import { PlusIcon } from "lucide-react";

const businesses = [
  { emoji: "🍽️", name: "Restaurant", desc: "Full table management & QR ordering" },
  { emoji: "☕", name: "Cafe", desc: "Orders, billing & loyalty tracking" },
  { emoji: "🥐", name: "Bakery", desc: "Product catalogue & daily billing" },
  { emoji: "🍵", name: "Tea Stall", desc: "Quick orders & cash tracking" },
  { emoji: "💊", name: "Medical Store", desc: "Product inventory & billing" },
  { emoji: "🛒", name: "Grocery", desc: "Stock management & billing" },
  { emoji: "📱", name: "Electronics", desc: "Product catalogue & invoicing" },
  { emoji: "👗", name: "Clothing", desc: "Catalogue, billing & party book" },
  { emoji: "✂️", name: "Salon", desc: "Appointments & service billing" },
  { emoji: "💆", name: "Spa", desc: "Booking & treatment billing" },
  { emoji: "📚", name: "Stationery", desc: "Product orders & billing" },
  {
    emoji: "🔧",
    name: "Hardware",
    desc: "Parts catalogue & customer records",
  },
];

const comingSoon = [
  "Service Business",
  "Food Court",
  "Cloud Kitchen",
  "Kiosk",
  "And many more...",
];

function BusinessCard({
  biz,
  index,
}: {
  biz: (typeof businesses)[0];
  index: number;
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-40px" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={isInView ? { opacity: 1, scale: 1 } : {}}
      transition={{
        duration: 0.4,
        delay: (index % 6) * 0.06,
        ease: [0.25, 0.1, 0.25, 1],
      }}
      className="group flex flex-col items-center text-center p-5 rounded-2xl border border-border/60 bg-card hover:border-primary/25 hover:bg-primary/2 hover:-translate-y-0.5 transition-all duration-250 cursor-default"
    >
      <div className="text-3xl mb-3 group-hover:scale-110 transition-transform duration-200">
        {biz.emoji}
      </div>
      <div className="font-semibold text-sm mb-1">{biz.name}</div>
      <div className="text-[11px] text-muted-foreground leading-snug">
        {biz.desc}
      </div>
    </motion.div>
  );
}

export function BusinessTypesSection() {
  return (
    <section id="businesses" className="py-24 lg:py-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <FadeIn className="text-center mb-16">
          <span className="text-xs font-semibold uppercase tracking-widest text-primary mb-3 block">
            Business Categories
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
            Built for every local business
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Oowapp started with restaurants. But the platform is built to serve
            any local business — whatever you sell, wherever you are.
          </p>
        </FadeIn>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          {businesses.map((biz, i) => (
            <BusinessCard key={biz.name} biz={biz} index={i} />
          ))}
        </div>

        {/* Coming soon card */}
        <FadeIn className="mt-3">
          <div className="rounded-2xl border border-dashed border-border/80 bg-muted/10 p-6 text-center">
            <div className="inline-flex items-center justify-center size-10 rounded-xl border border-dashed border-border bg-background mb-3">
              <PlusIcon size={18} className="text-muted-foreground" />
            </div>
            <div className="font-semibold text-sm mb-2">More coming soon</div>
            <div className="flex flex-wrap justify-center gap-2">
              {comingSoon.map((name) => (
                <span
                  key={name}
                  className="text-xs text-muted-foreground bg-muted/60 rounded-full px-3 py-1"
                >
                  {name}
                </span>
              ))}
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
