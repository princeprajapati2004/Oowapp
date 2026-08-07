"use client";

import { FadeIn } from "./motion";
import {
  MessageCircleIcon,
  FileTextIcon,
  TableIcon,
  SmartphoneIcon,
  ArrowRightIcon,
  LayoutDashboardIcon,
} from "lucide-react";

const before = [
  { icon: MessageCircleIcon, label: "WhatsApp orders", sub: "Lost in chat threads" },
  { icon: FileTextIcon, label: "Paper receipts", sub: "Manual calculations" },
  { icon: TableIcon, label: "Excel sheets", sub: "Updated manually" },
  { icon: SmartphoneIcon, label: "Separate apps", sub: "Payments, orders, billing" },
];

const after = [
  "QR-based ordering from the table",
  "UPI & cash payments, tracked",
  "Automated GST bills & invoices",
  "Live dashboard with analytics",
  "Staff management & kitchen display",
  "Customer order tracking",
];

export function StorySection() {
  return (
    <section id="about" className="py-24 lg:py-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <FadeIn className="text-center mb-16">
          <span className="text-xs font-semibold uppercase tracking-widest text-primary mb-3 block">
            The Problem
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
            Running a business shouldn&apos;t be this hard
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Most local businesses juggle 4–5 different tools just to take an
            order and get paid. Oowapp brings it all together.
          </p>
        </FadeIn>

        <div className="grid lg:grid-cols-[1fr_auto_1fr] gap-8 lg:gap-12 items-start">
          {/* Before */}
          <FadeIn direction="right">
            <div className="rounded-2xl border border-border/60 bg-muted/20 p-6 lg:p-8">
              <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-5">
                Before Oowapp
              </div>
              <div className="space-y-3">
                {before.map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center gap-3 p-3 rounded-xl bg-background/60 border border-border/40"
                  >
                    <div className="p-2 rounded-lg bg-destructive/8 shrink-0">
                      <item.icon size={15} className="text-destructive" />
                    </div>
                    <div>
                      <div className="text-sm font-medium">{item.label}</div>
                      <div className="text-xs text-muted-foreground">
                        {item.sub}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-5 text-xs text-muted-foreground leading-relaxed">
                Time-consuming. Error-prone. No visibility into what&apos;s
                happening in your business.
              </p>
            </div>
          </FadeIn>

          {/* Arrow */}
          <FadeIn
            direction="none"
            className="flex lg:flex-col items-center justify-center py-4"
          >
            <div className="flex items-center gap-2 lg:flex-col">
              <div className="h-px w-8 lg:h-8 lg:w-px bg-border lg:mx-auto" />
              <div className="p-3 rounded-full border border-primary/30 bg-primary/5 text-primary">
                <ArrowRightIcon size={18} className="lg:rotate-90" />
              </div>
              <div className="h-px w-8 lg:h-8 lg:w-px bg-border lg:mx-auto" />
            </div>
          </FadeIn>

          {/* After */}
          <FadeIn direction="left">
            <div className="rounded-2xl border border-primary/20 bg-primary/3 p-6 lg:p-8">
              <div className="text-xs font-semibold uppercase tracking-widest text-primary mb-5">
                With Oowapp
              </div>
              <div className="space-y-2.5">
                {after.map((item) => (
                  <div
                    key={item}
                    className="flex items-center gap-3 p-3 rounded-xl bg-background/60 border border-primary/10"
                  >
                    <div className="size-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <div className="size-2 rounded-full bg-primary" />
                    </div>
                    <span className="text-sm font-medium">{item}</span>
                  </div>
                ))}
              </div>
              <p className="mt-5 text-xs text-primary/70 leading-relaxed">
                One platform. One login. Complete visibility.
              </p>
            </div>
          </FadeIn>
        </div>

        {/* Bottom callout */}
        <FadeIn className="mt-16 text-center">
          <div className="inline-flex items-center gap-3 border border-border/60 rounded-2xl px-6 py-4 bg-card">
            <LayoutDashboardIcon size={20} className="text-primary shrink-0" />
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">
                Oowapp is not just for restaurants.
              </span>{" "}
              It&apos;s the operating system for local businesses — cafes,
              bakeries, salons, medical stores, and more.
            </p>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
