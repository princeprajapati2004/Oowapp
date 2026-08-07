"use client";

import { FadeIn, motion } from "./motion";
import { useRef } from "react";
import { useInView } from "framer-motion";
import {
  QrCodeIcon,
  UsersIcon,
  UtensilsIcon,
  ReceiptIcon,
  CreditCardIcon,
  BanknoteIcon,
  TableIcon,
  LayoutDashboardIcon,
  BarChart3Icon,
  SmartphoneIcon,
  ZapIcon,
  PackageIcon,
} from "lucide-react";

const features = [
  {
    icon: QrCodeIcon,
    title: "QR Ordering",
    desc: "Customers scan a QR code at the table and order directly from their phone.",
    accent: "text-primary",
    accentBg: "bg-primary/8",
  },
  {
    icon: UsersIcon,
    title: "Staff Ordering",
    desc: "Staff can take orders on behalf of customers using the counter view.",
    accent: "text-primary",
    accentBg: "bg-primary/8",
  },
  {
    icon: UtensilsIcon,
    title: "Live Menu",
    desc: "Update your menu in real-time. Mark items as unavailable instantly.",
    accent: "text-primary",
    accentBg: "bg-primary/8",
  },
  {
    icon: ReceiptIcon,
    title: "Digital Billing",
    desc: "Auto-generate GST-compliant bills. Print or share as PDF with one tap.",
    accent: "text-primary",
    accentBg: "bg-primary/8",
  },
  {
    icon: CreditCardIcon,
    title: "UPI Payments",
    desc: "Accept UPI payments with a payment QR linked directly to your account.",
    accent: "text-primary",
    accentBg: "bg-primary/8",
  },
  {
    icon: BanknoteIcon,
    title: "Cash Tracking",
    desc: "Record cash payments and track all transactions in one place.",
    accent: "text-primary",
    accentBg: "bg-primary/8",
  },
  {
    icon: TableIcon,
    title: "Table Management",
    desc: "Manage multiple tables, track active sessions, and release with one tap.",
    accent: "text-primary",
    accentBg: "bg-primary/8",
  },
  {
    icon: LayoutDashboardIcon,
    title: "Business Dashboard",
    desc: "See revenue, orders, and top products in a live, visual dashboard.",
    accent: "text-primary",
    accentBg: "bg-primary/8",
  },
  {
    icon: BarChart3Icon,
    title: "Analytics",
    desc: "Track trends, best sellers, and peak hours to make smarter decisions.",
    accent: "text-primary",
    accentBg: "bg-primary/8",
  },
  {
    icon: SmartphoneIcon,
    title: "PWA App",
    desc: "Install as a native app on any device — iOS, Android, or desktop.",
    accent: "text-primary",
    accentBg: "bg-primary/8",
  },
  {
    icon: ZapIcon,
    title: "Fast Setup",
    desc: "Create your business profile, add your menu, and share your QR — done.",
    accent: "text-primary",
    accentBg: "bg-primary/8",
  },
  {
    icon: PackageIcon,
    title: "Inventory Ready",
    desc: "Architecture built for inventory management. Coming soon for all plans.",
    accent: "text-primary",
    accentBg: "bg-primary/8",
  },
];

function FeatureCard({
  feature,
  index,
}: {
  feature: (typeof features)[0];
  index: number;
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-40px" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{
        duration: 0.45,
        delay: (index % 4) * 0.07,
        ease: [0.25, 0.1, 0.25, 1],
      }}
      className="group p-5 rounded-2xl border border-border/60 bg-card hover:border-primary/20 hover:bg-primary/2 transition-all duration-300 cursor-default"
    >
      <div
        className={`inline-flex p-2.5 rounded-xl ${feature.accentBg} mb-4 group-hover:scale-105 transition-transform duration-200`}
      >
        <feature.icon size={18} className={feature.accent} />
      </div>
      <h3 className="font-semibold text-sm mb-1.5">{feature.title}</h3>
      <p className="text-xs text-muted-foreground leading-relaxed">
        {feature.desc}
      </p>
    </motion.div>
  );
}

export function FeaturesSection() {
  return (
    <section id="features" className="py-24 lg:py-32 bg-muted/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <FadeIn className="text-center mb-16">
          <span className="text-xs font-semibold uppercase tracking-widest text-primary mb-3 block">
            Features
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
            Everything you need to run your business
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            From taking the first order to analysing last month&apos;s revenue —
            Oowapp has it all covered.
          </p>
        </FadeIn>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {features.map((feature, i) => (
            <FeatureCard key={feature.title} feature={feature} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
