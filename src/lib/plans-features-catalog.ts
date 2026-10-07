// Canonical seed data for the Plan/Feature/PlanFeature/PlanLimit tables. This is a seed
// default, not a runtime source of truth — Super Admin can add plans/features and change
// plan/feature/limit values afterward via the Plan Management UI. `code` values for FREE/
// STARTER/PRO/ENTERPRISE intentionally match the legacy SubscriptionPlan enum so
// subscriptions created before this table existed still resolve correctly (see
// src/lib/services/feature-permission.ts). MOON_STAR/SUPER_STAR are new codes with no
// legacy-enum equivalent — their legacy `Subscription.plan` column value falls back to
// "FREE" (see subscription-admin.ts::legacyPlanColumnValue); harmless, since planId/planRef
// is the authoritative resolution path and nothing reads the legacy enum column anymore
// except that bridge fallback.

import type { LimitKey } from "@/generated/prisma/client";

export interface PlanCatalogEntry {
  code: string;
  name: string;
  description: string;
  sortOrder: number;
  isActive: boolean;
  // Retired — hidden from the public plan list and every create/upgrade/downgrade
  // picker, but kept seeded so historical Subscription rows still resolve by code.
  isArchived: boolean;
  monthlyPrice: number | null;
  annualPrice: number | null;
  currency: string;
  isPopular: boolean;
  trialDays: number;
}

export interface FeatureCatalogEntry {
  key: string;
  label: string;
  description: string;
  category: string;
}

// The 3 current public plans, per the OOWAPP subscription spec.
export const PLAN_CATALOG: PlanCatalogEntry[] = [
  {
    code: "MOON_STAR",
    name: "Moon Star",
    description: "Base plan for small business owners getting started with OOWAPP.",
    sortOrder: 1,
    isActive: true,
    isArchived: false,
    monthlyPrice: 99,
    annualPrice: 999,
    currency: "INR",
    isPopular: false,
    trialDays: 15,
  },
  {
    code: "SUPER_STAR",
    name: "Super Star",
    description: "The best plan for growing medium-sized businesses — adds backup, marketing, and barcode generation.",
    sortOrder: 2,
    isActive: true,
    isArchived: false,
    monthlyPrice: 999,
    annualPrice: 9999,
    currency: "INR",
    isPopular: true,
    trialDays: 15,
  },
  {
    code: "ENTERPRISE",
    name: "Enterprise",
    description: "Fully customizable plan for larger businesses — automated billing, e-invoicing, Tally export, payment gateway, e-way bills, and godowns.",
    sortOrder: 3,
    isActive: true,
    isArchived: false,
    // Annual pricing is negotiated per account (Contact Sales), not a fixed self-checkout
    // price — Super Admin sets it per-subscriber when relevant; left null here on purpose.
    monthlyPrice: 3999,
    annualPrice: null,
    currency: "INR",
    isPopular: false,
    trialDays: 15,
  },
  // Retired plans — kept seeded (never deleted) so historical Subscription rows that
  // reference them still resolve a real Plan via planId/code; hidden from every picker.
  {
    code: "FREE",
    name: "Free",
    description: "Internal trial-only tier automatically assigned at signup. Not shown publicly.",
    sortOrder: 0,
    isActive: false,
    isArchived: true,
    monthlyPrice: null,
    annualPrice: null,
    currency: "INR",
    isPopular: false,
    trialDays: 15,
  },
  {
    code: "STARTER",
    name: "Starter",
    description: "Retired plan, superseded by Moon Star / Super Star.",
    sortOrder: 98,
    isActive: false,
    isArchived: true,
    monthlyPrice: null,
    annualPrice: null,
    currency: "INR",
    isPopular: false,
    trialDays: 15,
  },
  {
    code: "PRO",
    name: "Pro",
    description: "Retired plan, superseded by Moon Star / Super Star.",
    sortOrder: 99,
    isActive: false,
    isArchived: true,
    monthlyPrice: null,
    annualPrice: null,
    currency: "INR",
    isPopular: false,
    trialDays: 15,
  },
];

export const FEATURE_CATALOG: FeatureCatalogEntry[] = [
  {
    key: "pos",
    label: "POS Billing",
    description: "Point-of-sale billing screen with cart, discounts, and payment recording.",
    category: "pos",
  },
  {
    key: "barcode_scanner",
    label: "Barcode Generation",
    description: "Generate and scan barcodes (USB, Bluetooth, and camera) inside POS.",
    category: "pos",
  },
  {
    key: "inventory",
    label: "Inventory Management",
    description: "Stock tracking with automatic deduction on sale.",
    category: "pos",
  },
  {
    key: "multi_staff",
    label: "Multiple Staff",
    description: "Additional staff/cashier/manager access for this business.",
    category: "team",
  },
  {
    key: "analytics",
    label: "Business Analytics",
    description: "Sales and order analytics dashboards.",
    category: "reporting",
  },
  {
    key: "custom_branding",
    label: "Custom Branding",
    description: "Legacy custom invoice branding flag — superseded by custom_invoice_themes.",
    category: "branding",
  },
  {
    key: "unlimited_products",
    label: "Unlimited Products",
    description: "No cap on the number of products or menu items.",
    category: "catalog",
  },
  {
    key: "advanced_reports",
    label: "Advanced Reports",
    description: "Exportable, detailed sales and tax reports.",
    category: "reporting",
  },
  {
    key: "expenses",
    label: "Expense Tracking",
    description: "Record and report business expenses.",
    category: "finance",
  },
  {
    key: "delivery",
    label: "Delivery Tracking",
    description: "Courier/tracking details and delivery charges on orders.",
    category: "fulfillment",
  },
  {
    key: "coupons",
    label: "Coupons",
    description: "Create and manage customer-facing discount codes.",
    category: "marketing",
  },
  {
    key: "online_store",
    label: "Online Store",
    description: "Customer-facing QR/web ordering storefront.",
    category: "catalog",
  },
  {
    key: "custom_invoice_themes",
    label: "Custom Invoice Themes",
    description: "Choose from multiple bill/invoice print layouts.",
    category: "branding",
  },
  {
    key: "backup",
    label: "Data Backup",
    description: "Business data backup and export.",
    category: "platform",
  },
  {
    key: "marketing",
    label: "Marketing & Promotion",
    description: "Marketing/promotion campaign tools.",
    category: "marketing",
  },
  {
    key: "automated_billing",
    label: "Automated Billing",
    description: "Scheduled/recurring automated billing.",
    category: "billing",
  },
  {
    key: "e_invoice",
    label: "E-Invoicing",
    description: "GST e-invoice (IRN) generation.",
    category: "compliance",
  },
  {
    key: "tally_export",
    label: "Tally Data Export",
    description: "Export accounting data in Tally-compatible format.",
    category: "compliance",
  },
  {
    key: "customer_payment_gateway",
    label: "Payment Gateway",
    description: "Accept customer payments online via an integrated payment gateway (distinct from OOWAPP's own subscription billing).",
    category: "billing",
  },
  {
    key: "e_way_bill",
    label: "E-Way Bills",
    description: "Generate GST e-way bills for shipments.",
    category: "compliance",
  },
  {
    key: "godown",
    label: "Godowns",
    description: "Multiple warehouse/godown stock locations.",
    category: "pos",
  },
];

// Which features are enabled by default for each plan code, out of the box.
// Editable afterward per-plan (Plan Management UI) or per-business (feature overrides).
export const DEFAULT_PLAN_FEATURES: Record<string, string[]> = {
  MOON_STAR: ["pos", "inventory", "analytics", "custom_invoice_themes", "online_store", "expenses", "delivery", "coupons"],
  SUPER_STAR: [
    "pos",
    "inventory",
    "barcode_scanner",
    "multi_staff",
    "analytics",
    "custom_invoice_themes",
    "online_store",
    "backup",
    "marketing",
    "advanced_reports",
    "expenses",
    "delivery",
    "coupons",
  ],
  ENTERPRISE: [
    "pos",
    "inventory",
    "barcode_scanner",
    "multi_staff",
    "analytics",
    "custom_branding",
    "custom_invoice_themes",
    "online_store",
    "unlimited_products",
    "advanced_reports",
    "backup",
    "marketing",
    "automated_billing",
    "e_invoice",
    "tally_export",
    "customer_payment_gateway",
    "e_way_bill",
    "godown",
    "expenses",
    "delivery",
    "coupons",
  ],
  // Retired plans keep their original (pre-rebrand) feature grid — never read by any
  // active picker once isArchived is true, kept only for historical-row resolution.
  FREE: ["delivery", "coupons"],
  STARTER: ["analytics", "delivery", "coupons", "expenses"],
  PRO: ["pos", "barcode_scanner", "inventory", "analytics", "advanced_reports", "delivery", "coupons", "expenses"],
};

// Numeric usage caps per plan code. Omitted (LimitKey, plan) pairs fall back to
// "unlimited" (see subscription-limits.ts) — used sparingly here (Enterprise) since an
// absent row and an explicit `null` limitValue resolve identically; both are written
// explicitly below for every plan so the Plan Management UI always has a row to edit.
export const PLAN_LIMIT_CATALOG: Record<string, Partial<Record<LimitKey, number | null>>> = {
  MOON_STAR: {
    BUSINESSES: 1,
    USERS: 1,
    PRODUCTS: 10,
    GODOWNS: 0,
    STORAGE_MB: 1024,
    MONTHLY_ORDERS: 500,
    CUSTOMERS: 500,
    INVOICES: 500,
  },
  SUPER_STAR: {
    BUSINESSES: 3,
    USERS: 3,
    PRODUCTS: 100,
    GODOWNS: 0,
    STORAGE_MB: 10240,
    MONTHLY_ORDERS: 5000,
    CUSTOMERS: 5000,
    INVOICES: 5000,
  },
  ENTERPRISE: {
    // ">5" per spec — a concrete starting default the Super Admin can raise per
    // account; PRODUCTS/GODOWNS/STORAGE_MB/MONTHLY_ORDERS/CUSTOMERS/INVOICES are
    // genuinely unlimited (null) at this tier.
    BUSINESSES: 10,
    USERS: 10,
    PRODUCTS: null,
    GODOWNS: null,
    STORAGE_MB: null,
    MONTHLY_ORDERS: null,
    CUSTOMERS: null,
    INVOICES: null,
  },
  FREE: {
    BUSINESSES: 1,
    USERS: 1,
    PRODUCTS: 5,
    GODOWNS: 0,
    STORAGE_MB: 256,
    MONTHLY_ORDERS: 50,
    CUSTOMERS: 50,
    INVOICES: 50,
  },
};
