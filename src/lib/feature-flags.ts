import type { SubscriptionPlan } from "@/generated/prisma/client";

export interface FeatureFlags {
  canExportCSV: boolean;
  canUseWhatsApp: boolean;
  // Direct Dashboard Ordering — orders go straight to DB/kitchen, no WhatsApp
  canUseDirect: boolean;
  // Staff roles: Kitchen Display and Waiter tablet
  canUseKitchenDisplay: boolean;
  canUseWaiterOrdering: boolean;
  maxProducts: number;      // -1 = unlimited
  maxCategories: number;    // -1 = unlimited
  maxQRs: number;           // -1 = unlimited
  maxStaffMembers: number;  // -1 = unlimited
  futureAI: boolean;
}

const PLAN_FLAGS: Record<SubscriptionPlan, FeatureFlags> = {
  FREE: {
    canExportCSV: false,
    canUseWhatsApp: true,
    canUseDirect: false,
    canUseKitchenDisplay: false,
    canUseWaiterOrdering: false,
    maxProducts: 30,
    maxCategories: 5,
    maxQRs: 1,
    maxStaffMembers: 0,
    futureAI: false,
  },
  STARTER: {
    canExportCSV: true,
    canUseWhatsApp: true,
    canUseDirect: false,
    canUseKitchenDisplay: false,
    canUseWaiterOrdering: false,
    maxProducts: 100,
    maxCategories: 20,
    maxQRs: 3,
    maxStaffMembers: 0,
    futureAI: false,
  },
  PRO: {
    canExportCSV: true,
    canUseWhatsApp: true,
    canUseDirect: true,
    canUseKitchenDisplay: true,
    canUseWaiterOrdering: true,
    maxProducts: 500,
    maxCategories: 50,
    maxQRs: 10,
    maxStaffMembers: 10,
    futureAI: false,
  },
  ENTERPRISE: {
    canExportCSV: true,
    canUseWhatsApp: true,
    canUseDirect: true,
    canUseKitchenDisplay: true,
    canUseWaiterOrdering: true,
    maxProducts: -1,
    maxCategories: -1,
    maxQRs: -1,
    maxStaffMembers: -1,
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
