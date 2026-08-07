import type { Metadata } from "next";
import { LandingHeader } from "@/components/landing/header";
import { LandingHero } from "@/components/landing/hero";
import { TrustBar } from "@/components/landing/trust-bar";
import { StorySection } from "@/components/landing/story";
import { FeaturesSection } from "@/components/landing/features";
import { BusinessTypesSection } from "@/components/landing/business-types";
import { HowItWorksSection } from "@/components/landing/how-it-works";
import { ComparisonSection } from "@/components/landing/comparison";
import { ShowcaseSection } from "@/components/landing/showcase";
import { BenefitsSection } from "@/components/landing/benefits";
import { TestimonialsSection } from "@/components/landing/testimonials";
import { FAQSection } from "@/components/landing/faq";
import { CTASection } from "@/components/landing/cta";
import { LandingFooter } from "@/components/landing/footer";

export const metadata: Metadata = {
  title: "Oowapp — The Business Operating System for Local Businesses",
  description:
    "Oowapp helps local businesses take orders, accept UPI payments, generate bills, and manage operations — all from one simple platform. No complexity. Start free.",
  keywords: [
    "QR ordering",
    "restaurant billing",
    "UPI payments",
    "digital menu",
    "business management",
    "local business software",
    "POS system India",
    "restaurant POS",
    "cafe billing",
    "small business app",
  ],
  openGraph: {
    type: "website",
    url: "https://oowapp.in",
    title: "Oowapp — The Business Operating System for Local Businesses",
    description:
      "Take orders, accept payments, generate bills, and manage your business — all in one place. Built for restaurants, cafes, and every local business.",
    siteName: "Oowapp",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Oowapp — The Business Operating System for Local Businesses",
    description:
      "QR ordering, UPI payments, digital billing, and business analytics — one platform for local businesses.",
    images: ["/og-image.png"],
  },
  alternates: {
    canonical: "https://oowapp.in",
  },
};

export default function LandingPage() {
  return (
    <>
      <LandingHeader />
      <main>
        <LandingHero />
        <TrustBar />
        <StorySection />
        <FeaturesSection />
        <BusinessTypesSection />
        <HowItWorksSection />
        <ComparisonSection />
        <ShowcaseSection />
        <BenefitsSection />
        <TestimonialsSection />
        <FAQSection />
        <CTASection />
      </main>
      <LandingFooter />
    </>
  );
}
