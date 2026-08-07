"use client";

import { FadeIn } from "./motion";
import { StarIcon } from "lucide-react";

export function TestimonialsSection() {
  return (
    <section className="py-24 lg:py-32 bg-muted/20">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <FadeIn>
          <div className="flex justify-center mb-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <StarIcon
                key={i}
                size={20}
                className="text-primary/30 fill-primary/20"
              />
            ))}
          </div>

          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
            This could be your success story
          </h2>

          <p className="text-muted-foreground text-lg max-w-lg mx-auto mb-10">
            We&apos;re just getting started. Early businesses are already using
            Oowapp to serve their customers better — and the results are
            speaking for themselves.
          </p>

          <div className="inline-flex items-center gap-3 rounded-2xl border border-dashed border-border/80 bg-background px-6 py-4">
            <div className="text-2xl">🌟</div>
            <div className="text-left">
              <div className="text-sm font-semibold text-foreground mb-0.5">
                Customer testimonials coming soon
              </div>
              <div className="text-xs text-muted-foreground">
                Be among the first businesses on Oowapp and share your story.
              </div>
            </div>
            <a
              href="/admin/signup"
              className="shrink-0 text-xs font-semibold text-primary hover:underline underline-offset-2"
            >
              Join now →
            </a>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
