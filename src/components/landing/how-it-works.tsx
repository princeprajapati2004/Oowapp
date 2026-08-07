"use client";

import { FadeIn, motion } from "./motion";
import { useRef } from "react";
import { useInView } from "framer-motion";
import {
  BuildingIcon,
  MenuIcon,
  QrCodeIcon,
  ShoppingBagIcon,
} from "lucide-react";

const steps = [
  {
    number: "01",
    icon: BuildingIcon,
    title: "Create your business",
    desc: "Sign up, add your business name, type, address, and logo. Takes 2 minutes.",
  },
  {
    number: "02",
    icon: MenuIcon,
    title: "Set up your menu",
    desc: "Add your products, categories, prices, and photos. Manage availability in real-time.",
  },
  {
    number: "03",
    icon: QrCodeIcon,
    title: "Share your QR",
    desc: "Download your unique QR code. Place it at tables, counter, or wherever customers are.",
  },
  {
    number: "04",
    icon: ShoppingBagIcon,
    title: "Start selling",
    desc: "Customers scan, order, and pay. You get live notifications and manage everything from your dashboard.",
  },
];

function StepCard({ step, index }: { step: (typeof steps)[0]; index: number }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-60px" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{
        duration: 0.5,
        delay: index * 0.12,
        ease: [0.25, 0.1, 0.25, 1],
      }}
      className="relative"
    >
      {/* Connector line */}
      {index < steps.length - 1 && (
        <div className="hidden lg:block absolute top-8 left-[calc(50%+2rem)] right-[calc(-50%+2rem)] h-px bg-border/60" />
      )}

      <div className="flex flex-col items-center text-center">
        {/* Step number + icon */}
        <div className="relative mb-5">
          <div className="size-16 rounded-2xl border border-border/80 bg-card flex items-center justify-center shadow-sm">
            <step.icon size={22} className="text-primary" />
          </div>
          <div className="absolute -top-2 -right-2 size-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
            {index + 1}
          </div>
        </div>

        <h3 className="font-semibold text-base mb-2">{step.title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
          {step.desc}
        </p>
      </div>
    </motion.div>
  );
}

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="py-24 lg:py-32 bg-muted/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <FadeIn className="text-center mb-16">
          <span className="text-xs font-semibold uppercase tracking-widest text-primary mb-3 block">
            How It Works
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
            Up and running in 4 steps
          </h2>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto">
            No complex setup. No expensive hardware. Just a few minutes to go
            from signup to your first order.
          </p>
        </FadeIn>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 lg:gap-6">
          {steps.map((step, i) => (
            <StepCard key={step.number} step={step} index={i} />
          ))}
        </div>

        {/* CTA */}
        <FadeIn className="mt-16 text-center">
          <a
            href="/admin/signup"
            className="inline-flex items-center h-11 px-7 rounded-xl bg-foreground text-background text-sm font-semibold hover:bg-foreground/90 transition-colors"
          >
            Start your business today →
          </a>
        </FadeIn>
      </div>
    </section>
  );
}
