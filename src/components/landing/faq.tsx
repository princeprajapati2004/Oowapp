"use client";

import { FadeIn } from "./motion";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqs = [
  {
    q: "Do customers need to download an app?",
    a: "No. Customers just scan the QR code with their phone camera and the menu opens instantly in their browser. No app download required.",
  },
  {
    q: "Can I use my own QR code?",
    a: "Oowapp generates a unique QR code for your business automatically. You can print it, display it on your table, or share it digitally — however works best for you.",
  },
  {
    q: "Can I accept UPI payments?",
    a: "Yes. You can link your UPI ID and display a payment QR to customers. Payments go directly to your bank account — no commission, no middlemen.",
  },
  {
    q: "Can my staff take orders on behalf of customers?",
    a: "Absolutely. Staff can use the counter view to take orders manually for any table. This works perfectly for customers who prefer to speak to staff instead of scanning.",
  },
  {
    q: "Can I manage multiple businesses?",
    a: "Yes. Each business gets its own separate dashboard, menu, QR, and settings. You can switch between them easily from the same login.",
  },
  {
    q: "Can I print bills?",
    a: "Yes. You can generate GST-compliant bills and print them directly from the dashboard, or share them as PDF via WhatsApp or download.",
  },
  {
    q: "Is Oowapp only for restaurants?",
    a: "No. Oowapp started with restaurants but it's built for any local business — cafes, bakeries, salons, medical stores, grocery stores, and many more. Any business that takes orders or sells products can use Oowapp.",
  },
  {
    q: "Do I need any special hardware?",
    a: "No. Oowapp works on any phone, tablet, or desktop — running Android, iOS, or a browser. No expensive POS machines or printers required (though you can connect one if you want).",
  },
  {
    q: "Is my data safe and private?",
    a: "Yes. Your business data, customer data, and transaction records are private and belong only to you. We do not share your data with any marketplace or third party.",
  },
  {
    q: "How long does setup take?",
    a: "Most businesses are set up and taking their first orders within 10–15 minutes. Add your business info, create your menu, and share your QR — that's it.",
  },
];

export function FAQSection() {
  return (
    <section id="contact" className="py-24 lg:py-32">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <FadeIn className="text-center mb-12">
          <span className="text-xs font-semibold uppercase tracking-widest text-primary mb-3 block">
            FAQ
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
            Questions & answers
          </h2>
          <p className="text-muted-foreground text-lg">
            Everything you need to know before getting started.
          </p>
        </FadeIn>

        <FadeIn>
          <Accordion multiple className="space-y-2">
            {faqs.map((faq, i) => (
              <AccordionItem
                key={i}
                value={`item-${i}`}
                className="border border-border/60 rounded-xl px-5 last:border-b bg-card"
              >
                <AccordionTrigger className="text-sm font-medium py-4 hover:no-underline">
                  {faq.q}
                </AccordionTrigger>
                <AccordionContent>
                  <p className="text-sm text-muted-foreground leading-relaxed pb-1">
                    {faq.a}
                  </p>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </FadeIn>

        <FadeIn className="mt-10 text-center">
          <p className="text-sm text-muted-foreground">
            Still have questions?{" "}
            <a
              href="mailto:hello@oowapp.in"
              className="text-primary font-medium hover:underline underline-offset-2"
            >
              Email us at hello@oowapp.in
            </a>
          </p>
        </FadeIn>
      </div>
    </section>
  );
}
