import {
  Receipt,
  ShoppingCart,
  BookOpen,
  ArrowLeftRight,
  TrendingUp,
  Boxes,
  Scale,
  BookUser,
  Package,
  Landmark,
  Percent,
  Gift,
  Share2,
  type LucideIcon,
} from "lucide-react";

export interface ReportCatalogEntry {
  slug: string;
  title: string;
  description: string;
  icon: LucideIcon;
  group: "Sales & Purchases" | "Finance" | "Inventory" | "Parties" | "Marketing";
}

// Single source of truth for the /admin/reports hub grid. A report only
// appears here once its page actually exists (see each report's own page.tsx
// under src/app/admin/(dashboard)/reports/) — safer than linking to a 404.
export const REPORTS_CATALOG: ReportCatalogEntry[] = [
  { slug: "sales", title: "Sales Report", description: "View sales, orders, taxes, discounts and net revenue.", icon: Receipt, group: "Sales & Purchases" },
  { slug: "purchase", title: "Purchase Report", description: "Track supplier purchases, quantities and payment status.", icon: ShoppingCart, group: "Sales & Purchases" },
  { slug: "profit", title: "Profit on Selling Report", description: "Gross and net profit for every item sold.", icon: TrendingUp, group: "Sales & Purchases" },
  { slug: "cashbook", title: "Cashbook Report", description: "Every cash inflow and outflow with a running balance.", icon: BookOpen, group: "Finance" },
  { slug: "transactions", title: "Transaction Report", description: "All payments across cash, UPI, card and bank transfer.", icon: ArrowLeftRight, group: "Finance" },
  { slug: "expenses", title: "Expense Report", description: "Business expenses by category, vendor and payment type.", icon: Receipt, group: "Finance" },
  { slug: "cash-bank", title: "Cash & Bank Report", description: "Cash vs bank/digital balances and movement.", icon: Landmark, group: "Finance" },
  { slug: "balance-sheet", title: "Balance Sheet", description: "Assets, liabilities and equity at a glance.", icon: Scale, group: "Finance" },
  { slug: "stock", title: "Stock Report", description: "Opening, purchased, sold and current stock per product.", icon: Boxes, group: "Inventory" },
  { slug: "items", title: "Item Report", description: "Per-product sales, purchases, stock and profit.", icon: Package, group: "Inventory" },
  { slug: "parties", title: "Party Report", description: "Customer and supplier balances and statements.", icon: BookUser, group: "Parties" },
  { slug: "discount", title: "Discount Report", description: "Discounts given across orders and items.", icon: Percent, group: "Marketing" },
  { slug: "cashback", title: "Cashback Report", description: "Cashback generated, credited and used.", icon: Gift, group: "Marketing" },
  { slug: "referrals", title: "Referral Report", description: "Referrals, qualifying orders and wallet rewards.", icon: Share2, group: "Marketing" },
];
