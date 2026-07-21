// Canonical seed data for the Plan/Feature/PlanFeature tables. This is a seed default,
// not a runtime source of truth — Super Admin can add plans/features and change
// plan-feature defaults afterward via the Plan Management UI (Phase 2+). Existing
// `code` values intentionally match the legacy SubscriptionPlan enum so subscriptions
// created before this table existed still resolve correctly (see
// src/lib/services/feature-permission.ts).

export interface PlanCatalogEntry {
  code: string;
  name: string;
  description: string;
  sortOrder: number;
}

export interface FeatureCatalogEntry {
  key: string;
  label: string;
  description: string;
  category: string;
}

export const PLAN_CATALOG: PlanCatalogEntry[] = [
  {
    code: "FREE",
    name: "Free",
    description: "Basic WhatsApp ordering with no premium features.",
    sortOrder: 0,
  },
  {
    code: "STARTER",
    name: "Starter",
    description: "Adds sales analytics for growing businesses.",
    sortOrder: 1,
  },
  {
    code: "PRO",
    name: "Pro",
    description: "Full POS with barcode scanning, inventory, and advanced reports.",
    sortOrder: 2,
  },
  {
    code: "ENTERPRISE",
    name: "Enterprise",
    description: "Everything in Pro, plus multi-staff access and custom branding.",
    sortOrder: 3,
  },
];

export const FEATURE_CATALOG: FeatureCatalogEntry[] = [
  {
    key: "pos",
    label: "POS",
    description: "Point-of-sale billing screen with cart, discounts, and payment recording.",
    category: "pos",
  },
  {
    key: "barcode_scanner",
    label: "Barcode Scanner",
    description: "USB, Bluetooth, and camera barcode scanning inside POS.",
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
    description: "Additional staff/cashier access for this business.",
    category: "team",
  },
  {
    key: "analytics",
    label: "Analytics",
    description: "Sales and order analytics dashboards.",
    category: "reporting",
  },
  {
    key: "custom_branding",
    label: "Custom Branding",
    description: "Custom invoice branding beyond the default template.",
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
];

// Which features are enabled by default for each plan code, out of the box.
// Editable afterward per-plan (Plan Management UI) or per-business (feature overrides).
export const DEFAULT_PLAN_FEATURES: Record<string, string[]> = {
  FREE: [],
  STARTER: ["analytics"],
  PRO: ["pos", "barcode_scanner", "inventory", "analytics", "advanced_reports"],
  ENTERPRISE: [
    "pos",
    "barcode_scanner",
    "inventory",
    "multi_staff",
    "analytics",
    "custom_branding",
    "unlimited_products",
    "advanced_reports",
  ],
};
