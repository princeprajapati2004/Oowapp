"use client";

import Link from "next/link";
import { FadeIn } from "./motion";
import { ArrowRightIcon, CalendarIcon } from "lucide-react";

export function CTASection() {
  return (
    <section className="py-24 lg:py-32 bg-foreground dark:bg-card">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <FadeIn>
          <div className="inline-flex items-center gap-2 rounded-full border border-background/20 bg-background/10 px-3 py-1 text-xs font-medium text-background/80 dark:text-foreground/80 mb-6">
            <span className="size-1.5 rounded-full bg-primary animate-pulse" />
            Start for free · No credit card required
          </div>

          <h2 className="text-3xl sm:text-5xl font-bold tracking-tight text-background dark:text-foreground mb-5 leading-tight">
            Ready to modernize
            <br />
            your business?
          </h2>

          <p className="text-background/70 dark:text-muted-foreground text-lg max-w-xl mx-auto mb-10 leading-relaxed">
            Join businesses across India that are already using Oowapp to take
            orders, accept payments, and grow faster.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/admin/signup"
              className="inline-flex items-center gap-2 h-12 px-8 rounded-xl bg-background text-foreground dark:bg-primary dark:text-primary-foreground text-sm font-semibold hover:bg-background/90 dark:hover:bg-primary/90 transition-colors shadow-sm"
            >
              Start for free
              <ArrowRightIcon size={16} />
            </Link>
            <a
              href="mailto:hello@oowapp.in"
              className="inline-flex items-center gap-2 h-12 px-8 rounded-xl border border-background/30 dark:border-border text-background/90 dark:text-foreground text-sm font-semibold hover:bg-background/10 dark:hover:bg-muted transition-colors"
            >
              <CalendarIcon size={15} />
              Book a demo
            </a>
          </div>

          <p className="mt-8 text-xs text-background/50 dark:text-muted-foreground">
            Setup in minutes · Cancel anytime · No tech skills needed
          </p>
        </FadeIn>
      </div>
    </section>
  );
}
