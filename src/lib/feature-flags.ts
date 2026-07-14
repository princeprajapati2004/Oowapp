import type { SubscriptionPlan } from "@/generated/prisma/client";

export interface FeatureFlags {
  canExportCSV: boolean;
  canUseWhatsApp: boolean;
  maxProducts: number;      // -1 = unlimited
  maxCategories: number;    // -1 = unlimited
  maxQRs: number;           // -1 = unlimited
  futureAI: boolean;
}

const PLAN_FLAGS: Record<SubscriptionPlan, FeatureFlags> = {
  FREE: {
    canExportCSV: false,
    canUseWhatsApp: true,
    maxProducts: 30,
    maxCategories: 5,
    maxQRs: 1,
    futureAI: false,
  },
  STARTER: {
    canExportCSV: true,
    canUseWhatsApp: true,
    maxProducts: 100,
    maxCategories: 20,
    maxQRs: 3,
    futureAI: false,
  },
  PRO: {
    canExportCSV: true,
    canUseWhatsApp: true,
    maxProducts: 500,
    maxCategories: 50,
    maxQRs: 10,
    futureAI: false,
  },
  ENTERPRISE: {
    canExportCSV: true,
    canUseWhatsApp: true,
    maxProducts: -1,
    maxCategories: -1,
    maxQRs: -1,
    futureAI: true,
  },
};

export function getFeatureFlags(plan: SubscriptionPlan): FeatureFlags {
  return PLAN_FLAGS[plan];
}

export function checkFeature<K extends keyof FeatureFlags>(
  plan: SubscriptionPlan,
  feature: K
): FeatureFlags[K] {
  return PLAN_FLAGS[plan][feature];
}

export function isUnlimited(value: number): boolean {
  return value === -1;
}
