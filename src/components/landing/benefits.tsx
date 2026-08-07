"use client";

import { FadeIn, motion } from "./motion";
import { useRef } from "react";
import { useInView } from "framer-motion";
import {
  TrendingUpIcon,
  EyeIcon,
  ShieldIcon,
  BanknoteIcon,
  PrinterIcon,
  UsersIcon,
  TabletSmartphoneIcon,
  ClockIcon,
  CheckCircle2Icon,
  SmilePlusIcon,
  ScanQrCodeIcon,
  HistoryIcon,
} from "lucide-react";

const groups = [
  {
    audience: "Business Owners",
    emoji: "🏢",
    color: "border-primary/20 bg-primary/3",
    headerBg: "bg-primary/8",
    iconColor: "text-primary",
    benefits: [
      { icon: TrendingUpIcon, text: "Live revenue and order analytics" },
      { icon: EyeIcon, text: "Full visibility into every table and order" },
      { icon: BanknoteIcon, text: "Track UPI and cash payments in one place" },
      { icon: PrinterIcon, text: "Generate GST bills and print with one tap" },
      { icon: ShieldIcon, text: "Your data — not shared with any marketplace" },
      { icon: UsersIcon, text: "Manage staff permissions and access" },
    ],
  },
  {
    audience: "Staff Members",
    emoji: "👨‍🍳",
    color: "border-border/60 bg-card",
    headerBg: "bg-muted/40",
    iconColor: "text-foreground",
    benefits: [
      { icon: TabletSmartphoneIcon, text: "Take orders on any phone or tablet" },
      { icon: ClockIcon, text: "Real-time order status from the kitchen" },
      { icon: CheckCircle2Icon, text: "Mark orders ready with a single tap" },
      { icon: BanknoteIcon, text: "Quickly accept cash or UPI at the counter" },
      { icon: PrinterIcon, text: "Print bills without leaving the counter" },
      { icon: UsersIcon, text: "No complex training required" },
    ],
  },
  {
    audience: "Customers",
    emoji: "😊",
    color: "border-border/60 bg-card",
    headerBg: "bg-muted/40",
    iconColor: "text-foreground",
    benefits: [
      { icon: ScanQrCodeIcon, text: "Scan QR and order without waiting" },
      { icon: SmilePlusIcon, text: "No app download needed" },
      { icon: CheckCircle2Icon, text: "Real-time order tracking on their phone" },
      { icon: BanknoteIcon, text: "Pay via UPI or cash — their choice" },
      { icon: HistoryIcon, text: "View order history and previous bills" },
      { icon: PrinterIcon, text: "Get digital bill instantly via WhatsApp" },
    ],
  },
];

function BenefitGroup({
  group,
  index,
}: {
  group: (typeof groups)[0];
  index: number;
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{
        duration: 0.5,
        delay: index * 0.1,
        ease: [0.25, 0.1, 0.25, 1],
      }}
      className={`rounded-2xl border overflow-hidden ${group.color}`}
    >
      {/* Header */}
      <div className={`px-6 py-5 ${group.headerBg} border-b border-border/40`}>
        <div className="flex items-center gap-3">
          <span className="text-2xl">{group.emoji}</span>
          <div>
            <div className="font-bold text-base">{group.audience}</div>
            <div className="text-xs text-muted-foreground">
              What you gain with Oowapp
            </div>
          </div>
        </div>
      </div>

      {/* Benefits list */}
      <div className="p-6 space-y-3">
        {group.benefits.map((b) => (
          <div key={b.text} className="flex items-start gap-3">
            <div className="size-5 rounded-md bg-background/80 border border-border/50 flex items-center justify-center shrink-0 mt-0.5">
              <b.icon size={11} className={group.iconColor} />
            </div>
            <span className="text-sm text-foreground/80 leading-snug">
              {b.text}
            </span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

export function BenefitsSection() {
  return (
    <section className="py-24 lg:py-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <FadeIn className="text-center mb-16">
          <span className="text-xs font-semibold uppercase tracking-widest text-primary mb-3 block">
            Who Benefits
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
            Good for everyone in your business
          </h2>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto">
            Oowapp is designed to make life easier for business owners, their
            staff, and most importantly — their customers.
          </p>
        </FadeIn>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {groups.map((group, i) => (
            <BenefitGroup key={group.audience} group={group} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
