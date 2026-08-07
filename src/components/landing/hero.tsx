"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRightIcon,
  QrCodeIcon,
  ReceiptIcon,
  BanknoteIcon,
  LayoutDashboardIcon,
  CheckCircle2Icon,
} from "lucide-react";

const floatingCards = [
  {
    icon: CheckCircle2Icon,
    color: "text-emerald-500",
    bg: "bg-emerald-50 dark:bg-emerald-950/50",
    label: "New Order",
    sub: "Table 5 · ₹480",
    delay: 0,
  },
  {
    icon: BanknoteIcon,
    color: "text-blue-500",
    bg: "bg-blue-50 dark:bg-blue-950/50",
    label: "Payment Received",
    sub: "UPI · ₹1,240",
    delay: 0.15,
  },
  {
    icon: ReceiptIcon,
    color: "text-violet-500",
    bg: "bg-violet-50 dark:bg-violet-950/50",
    label: "Bill Generated",
    sub: "GST Invoice #482",
    delay: 0.3,
  },
];

function AppMockup() {
  return (
    <div className="relative w-full max-w-[560px] mx-auto select-none">
      {/* Main dashboard window */}
      <motion.div
        initial={{ opacity: 0, y: 32, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.7, delay: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
        className="relative rounded-2xl border border-border/80 bg-card shadow-2xl overflow-hidden"
      >
        {/* Window chrome */}
        <div className="flex items-center gap-1.5 px-4 py-3 border-b border-border/60 bg-muted/30">
          <div className="size-3 rounded-full bg-red-400/70" />
          <div className="size-3 rounded-full bg-yellow-400/70" />
          <div className="size-3 rounded-full bg-green-400/70" />
          <div className="flex-1 mx-4">
            <div className="bg-background/80 rounded-md h-5 text-[10px] text-muted-foreground flex items-center px-2 font-mono">
              oowapp.in/admin
            </div>
          </div>
        </div>

        {/* Dashboard UI */}
        <div className="p-4 bg-background/50">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="h-3 w-32 bg-foreground/10 rounded mb-1.5" />
              <div className="h-2.5 w-20 bg-foreground/6 rounded" />
            </div>
            <div className="flex gap-2">
              <div className="h-7 w-7 rounded-lg bg-primary/10" />
              <div className="h-7 w-7 rounded-lg bg-muted" />
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            {[
              { label: "Revenue", value: "₹12,480", color: "text-primary" },
              { label: "Orders", value: "47", color: "text-foreground" },
              { label: "Tables", value: "8 / 12", color: "text-foreground" },
            ].map((stat) => (
              <div
                key={stat.label}
                className="bg-card rounded-xl p-3 border border-border/60"
              >
                <div className="text-[10px] text-muted-foreground mb-1">
                  {stat.label}
                </div>
                <div className={`text-sm font-semibold ${stat.color}`}>
                  {stat.value}
                </div>
              </div>
            ))}
          </div>

          {/* Mini chart */}
          <div className="bg-card rounded-xl p-3 border border-border/60 mb-3">
            <div className="flex items-end gap-1 h-12">
              {[30, 55, 40, 70, 60, 85, 75, 90, 65, 80, 95, 72].map(
                (h, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-sm"
                    style={{
                      height: `${h}%`,
                      backgroundColor:
                        i === 11
                          ? "oklch(0.596 0.145 163.23)"
                          : i > 8
                          ? "oklch(0.596 0.145 163.23 / 0.4)"
                          : "oklch(0.596 0.145 163.23 / 0.15)",
                    }}
                  />
                )
              )}
            </div>
          </div>

          {/* Recent orders */}
          <div className="space-y-1.5">
            {[
              { table: "T-5", items: "3 items", status: "Ready", amount: "₹480" },
              { table: "T-2", items: "5 items", status: "Preparing", amount: "₹820" },
              { table: "T-8", items: "2 items", status: "Served", amount: "₹260" },
            ].map((order) => (
              <div
                key={order.table}
                className="flex items-center justify-between bg-card rounded-lg px-3 py-2 border border-border/40"
              >
                <div className="flex items-center gap-2">
                  <div className="size-6 rounded-md bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center">
                    {order.table}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {order.items}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                      order.status === "Ready"
                        ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50"
                        : order.status === "Preparing"
                        ? "bg-amber-50 text-amber-600 dark:bg-amber-950/50"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {order.status}
                  </span>
                  <span className="text-[11px] font-semibold">
                    {order.amount}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Floating phone */}
      <motion.div
        initial={{ opacity: 0, x: 32, scale: 0.95 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        transition={{ duration: 0.65, delay: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
        className="absolute -right-8 -bottom-8 w-36 rounded-[20px] border-4 border-border/80 bg-card shadow-xl overflow-hidden hidden sm:block"
      >
        <div className="bg-muted/40 h-5 flex items-center justify-center">
          <div className="w-10 h-1.5 bg-foreground/15 rounded-full" />
        </div>
        <div className="p-2 space-y-1.5">
          <div className="bg-primary/10 rounded-lg p-2 flex items-center justify-center">
            <QrCodeIcon size={32} className="text-primary" />
          </div>
          <div className="text-[8px] text-center text-muted-foreground font-medium">
            Scan to order
          </div>
          <div className="text-[9px] text-center font-semibold">Table 5</div>
          <div className="space-y-1">
            {["Butter Chicken", "Naan", "Lassi"].map((item) => (
              <div
                key={item}
                className="flex items-center justify-between bg-muted/60 rounded px-1.5 py-0.5"
              >
                <span className="text-[7px] text-muted-foreground truncate">
                  {item}
                </span>
                <div className="size-3 rounded bg-primary/20 flex items-center justify-center">
                  <span className="text-[6px] text-primary font-bold">+</span>
                </div>
              </div>
            ))}
          </div>
          <div className="bg-primary text-primary-foreground rounded-lg py-1.5 text-[8px] font-bold text-center">
            Place Order
          </div>
        </div>
      </motion.div>

      {/* Floating notification cards */}
      {floatingCards.map((card, i) => (
        <motion.div
          key={card.label}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{
            duration: 0.5,
            delay: 0.8 + card.delay,
            ease: [0.25, 0.1, 0.25, 1],
          }}
          className="absolute -left-4 flex items-center gap-2.5 bg-background/90 backdrop-blur-sm border border-border/80 rounded-xl px-3 py-2 shadow-lg text-xs"
          style={{ top: `${16 + i * 68}px` }}
        >
          <div className={`p-1.5 rounded-lg ${card.bg}`}>
            <card.icon size={14} className={card.color} />
          </div>
          <div>
            <div className="font-semibold text-foreground leading-tight">
              {card.label}
            </div>
            <div className="text-muted-foreground text-[10px]">{card.sub}</div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

export function LandingHero() {
  return (
    <section className="relative pt-32 pb-20 lg:pt-40 lg:pb-28 overflow-hidden">
      {/* Subtle background */}
      <div
        className="absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -10%, oklch(0.596 0.145 163.23 / 0.07), transparent)",
        }}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left: Copy */}
          <div>
            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="inline-flex items-center gap-2 border border-border/80 rounded-full px-3 py-1 text-xs font-medium text-muted-foreground bg-muted/40 mb-6"
            >
              <span className="size-1.5 rounded-full bg-primary animate-pulse" />
              Made in India · Built for local businesses
            </motion.div>

            {/* Headline */}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.05, ease: [0.25, 0.1, 0.25, 1] }}
              className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-foreground leading-[1.1] mb-6"
            >
              Everything your
              <br />
              business needs.
              <br />
              <span className="text-primary">One platform.</span>
            </motion.h1>

            {/* Subheading */}
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
              className="text-lg text-muted-foreground leading-relaxed mb-8 max-w-xl"
            >
              Oowapp helps businesses take orders, accept payments, generate
              bills, and manage operations — all from one simple dashboard.
              No complexity. No chaos.
            </motion.p>

            {/* Feature pills */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.22 }}
              className="flex flex-wrap gap-2 mb-8"
            >
              {[
                { icon: QrCodeIcon, label: "QR Ordering" },
                { icon: BanknoteIcon, label: "UPI Payments" },
                { icon: ReceiptIcon, label: "Digital Bills" },
                { icon: LayoutDashboardIcon, label: "Live Dashboard" },
              ].map(({ icon: Icon, label }) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1.5 text-xs font-medium bg-muted/60 text-muted-foreground rounded-full px-3 py-1.5 border border-border/60"
                >
                  <Icon size={12} className="text-primary" />
                  {label}
                </span>
              ))}
            </motion.div>

            {/* CTAs */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.28 }}
              className="flex flex-wrap gap-3"
            >
              <Link
                href="/admin/signup"
                className="inline-flex items-center gap-2 h-11 px-6 rounded-xl bg-foreground text-background text-sm font-semibold hover:bg-foreground/90 transition-colors shadow-sm"
              >
                Start for free
                <ArrowRightIcon size={15} />
              </Link>
              <a
                href="#how-it-works"
                onClick={(e) => {
                  e.preventDefault();
                  document
                    .querySelector("#how-it-works")
                    ?.scrollIntoView({ behavior: "smooth" });
                }}
                className="inline-flex items-center gap-2 h-11 px-6 rounded-xl border border-border/80 bg-background text-foreground text-sm font-semibold hover:bg-muted transition-colors"
              >
                See how it works
              </a>
            </motion.div>

            {/* Social proof hint */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.5 }}
              className="mt-5 text-xs text-muted-foreground"
            >
              No credit card required · Free to start · Setup in minutes
            </motion.p>
          </div>

          {/* Right: App mockup */}
          <div className="relative flex justify-center lg:justify-end pl-8 lg:pl-0">
            <AppMockup />
          </div>
        </div>
      </div>
    </section>
  );
}
