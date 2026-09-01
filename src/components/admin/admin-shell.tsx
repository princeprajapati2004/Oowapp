"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Settings,
  FolderTree,
  UtensilsCrossed,
  Percent,
  QrCode,
  ClipboardList,
  RotateCcw,
  PackageX,
  Menu,
  LogOut,
  ExternalLink,
  ChefHat,
  Banknote,
  Table2,
  BookUser,
  Users,
  Barcode,
  FileSpreadsheet,
  Receipt,
  Ticket,
  Wallet,
  Gift,
  Share2,
  ChevronDown,
  Star,
  BarChart3,
  ShoppingCart,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { InstallApp } from "@/components/shared/install-app";
import { QuickActionsFab } from "@/components/admin/quick-actions-fab";
import { NotificationBell } from "@/components/admin/notification-bell";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api-client";
import type { NotificationEventPayload } from "@/lib/hooks/use-order-events";

// ── Nav structure ─────────────────────────────────────────────────────────────

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

type NavGroup = {
  groupLabel: string;
  icon: LucideIcon;
  items: NavItem[];
};

type NavEntry = NavItem | NavGroup;

function isGroup(entry: NavEntry): entry is NavGroup {
  return "groupLabel" in entry;
}

export type ShellCopy = {
  catalogueGroupLabel: string;
  previewLabel: string;
  orderDisplayLabel: string;
};

function buildNavEntries(foodBusiness: boolean, copy: ShellCopy): NavEntry[] {
  const operationsItems: NavItem[] = [
    { href: "/admin/orders", label: "Orders", icon: ClipboardList },
    { href: "/admin/returns", label: "Returns & Refunds", icon: RotateCcw },
    { href: "/admin/loss-damage", label: "Loss & Damage", icon: PackageX },
  ];
  if (foodBusiness) {
    operationsItems.push({ href: "/admin/tables", label: "Tables", icon: Table2 });
  }

  return [
    { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
    { href: "/admin/reports", label: "Reports", icon: BarChart3 },
    {
      groupLabel: "Operations",
      icon: ClipboardList,
      items: operationsItems,
    },
    {
      groupLabel: copy.catalogueGroupLabel,
      icon: UtensilsCrossed,
      items: [
        { href: "/admin/categories", label: "Categories", icon: FolderTree },
        { href: "/admin/products", label: "Products", icon: UtensilsCrossed },
        { href: "/admin/menu-import", label: "Bulk Import", icon: FileSpreadsheet },
      ],
    },
    {
      groupLabel: "Finance",
      icon: Receipt,
      items: [
        { href: "/admin/expenses", label: "Expenses", icon: Receipt },
        { href: "/admin/purchases", label: "Purchases", icon: ShoppingCart },
        { href: "/admin/taxes", label: "Taxes", icon: Percent },
      ],
    },
    {
      groupLabel: "Marketing",
      icon: Ticket,
      items: [
        { href: "/admin/coupons", label: "Coupons", icon: Ticket },
        { href: "/admin/cashback", label: "Cashback", icon: Gift },
        { href: "/admin/referrals", label: "Referrals", icon: Share2 },
      ],
    },
    {
      groupLabel: "People",
      icon: Users,
      items: [
        { href: "/admin/staff", label: "Staff", icon: Users },
        { href: "/admin/parties", label: "Parties", icon: BookUser },
        { href: "/admin/customers", label: "Customers", icon: Wallet },
        { href: "/admin/reviews", label: "Reviews", icon: Star },
      ],
    },
    {
      groupLabel: "Tools",
      icon: QrCode,
      items: [
        { href: "/admin/qr", label: "QR Code", icon: QrCode },
        { href: "/admin/barcodes", label: "Barcodes", icon: Barcode },
      ],
    },
    { href: "/admin/settings", label: "Settings", icon: Settings },
  ];
}

function isItemActive(href: string, pathname: string) {
  return href === "/admin"
    ? pathname === "/admin"
    : pathname === href || pathname.startsWith(href + "/");
}

function findActiveLabel(pathname: string, navEntries: NavEntry[]): string {
  for (const entry of navEntries) {
    if (!isGroup(entry)) {
      if (isItemActive(entry.href, pathname)) return entry.label;
    } else {
      for (const item of entry.items) {
        if (isItemActive(item.href, pathname)) return item.label;
      }
    }
  }
  return "Dashboard";
}

// ── NavLinks ──────────────────────────────────────────────────────────────────

function NavLinks({
  pathname,
  onNavigate,
  navEntries,
}: {
  pathname: string;
  onNavigate?: () => void;
  navEntries: NavEntry[];
}) {
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    const set = new Set<string>();
    for (const entry of navEntries) {
      if (isGroup(entry) && entry.items.some((i) => isItemActive(i.href, pathname))) {
        set.add(entry.groupLabel);
      }
    }
    return set;
  });

  // Auto-expand the group that contains the active route on navigation
  useEffect(() => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      for (const entry of navEntries) {
        if (isGroup(entry) && entry.items.some((i) => isItemActive(i.href, pathname))) {
          next.add(entry.groupLabel);
        }
      }
      return next;
    });
  }, [pathname, navEntries]);

  function toggleGroup(label: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  return (
    <nav className="space-y-0.5">
      {navEntries.map((entry) => {
        if (!isGroup(entry)) {
          const active = isItemActive(entry.href, pathname);
          const Icon = entry.icon;
          return (
            <Link
              key={entry.href}
              href={entry.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon
                className={cn(
                  "size-4 shrink-0",
                  active ? "text-primary" : "text-muted-foreground"
                )}
              />
              {entry.label}
            </Link>
          );
        }

        // Group entry
        const isOpen = openGroups.has(entry.groupLabel);
        const hasActiveChild = entry.items.some((i) => isItemActive(i.href, pathname));
        const GroupIcon = entry.icon;

        return (
          <div key={entry.groupLabel}>
            <button
              type="button"
              onClick={() => toggleGroup(entry.groupLabel)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150",
                hasActiveChild
                  ? "text-primary hover:bg-primary/5"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <GroupIcon
                className={cn(
                  "size-4 shrink-0",
                  hasActiveChild ? "text-primary" : "text-muted-foreground"
                )}
              />
              <span className="flex-1 text-left">{entry.groupLabel}</span>
              <ChevronDown
                className={cn(
                  "size-3.5 shrink-0 text-muted-foreground/70 transition-transform duration-200",
                  isOpen && "rotate-180"
                )}
              />
            </button>
            <div
              className={cn(
                "overflow-hidden transition-all duration-200 ease-in-out",
                isOpen ? "max-h-64" : "max-h-0"
              )}
            >
              <div className="ml-3 mt-0.5 mb-0.5 space-y-0.5 border-l border-border/60 pl-3">
                {entry.items.map((item) => {
                  const active = isItemActive(item.href, pathname);
                  const ItemIcon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onNavigate}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-all duration-150",
                        active
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      <ItemIcon
                        className={cn(
                          "size-3.5 shrink-0",
                          active ? "text-primary" : "text-muted-foreground"
                        )}
                      />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}
    </nav>
  );
}

// ── SidebarContent ─────────────────────────────────────────────────────────────

function SidebarContent({
  pathname,
  shopSlug,
  onNavigate,
  onLogout,
  foodBusiness,
  copy,
  navEntries,
}: {
  pathname: string;
  shopSlug: string;
  onNavigate?: () => void;
  onLogout: () => void;
  foodBusiness: boolean;
  copy: ShellCopy;
  navEntries: NavEntry[];
}) {
  return (
    <>
      <NavLinks pathname={pathname} onNavigate={onNavigate} navEntries={navEntries} />
      <div className="mt-auto space-y-0.5 border-t pt-3">
        <Link
          href={`/order/${shopSlug}`}
          target="_blank"
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-all duration-150 hover:bg-muted hover:text-foreground"
        >
          <ExternalLink className="size-4 shrink-0" />
          {copy.previewLabel}
        </Link>
        {foodBusiness && (
          <Link
            href="/admin/kitchen"
            target="_blank"
            onClick={onNavigate}
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-all duration-150 hover:bg-muted hover:text-foreground"
          >
            <ChefHat className="size-4 shrink-0" />
            Kitchen display
          </Link>
        )}
        <Link
          href="/admin/counter"
          target="_blank"
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-all duration-150 hover:bg-muted hover:text-foreground"
        >
          <Banknote className="size-4 shrink-0" />
          Cash counter
        </Link>
        <button
          onClick={() => {
            onNavigate?.();
            onLogout();
          }}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-all duration-150 hover:bg-muted hover:text-foreground"
        >
          <LogOut className="size-4 shrink-0" />
          Log out
        </button>
      </div>
    </>
  );
}

// ── AdminShell ─────────────────────────────────────────────────────────────────

export function AdminShell({
  shopName,
  shopSlug,
  initialNotifications,
  isFoodBusiness,
  copy,
  children,
}: {
  shopName: string;
  shopSlug: string;
  initialNotifications: NotificationEventPayload[];
  isFoodBusiness: boolean;
  copy: ShellCopy;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navEntries = buildNavEntries(isFoodBusiness, copy);
  const pageTitle = findActiveLabel(pathname, navEntries);

  async function handleLogout() {
    await api.post("/api/auth/logout");
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen">
      <QuickActionsFab />
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-r bg-background print:hidden">
        <div className="flex h-14 items-center gap-2.5 border-b px-4">
          <Image
            src="/logo_1.webp"
            alt="OOWAPP"
            width={28}
            height={28}
            className="rounded-md shrink-0"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-tight truncate">{shopName}</p>
            <p className="text-[11px] text-muted-foreground truncate">/order/{shopSlug}</p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <SidebarContent
            pathname={pathname}
            shopSlug={shopSlug}
            onLogout={handleLogout}
            foodBusiness={isFoodBusiness}
            copy={copy}
            navEntries={navEntries}
          />
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex h-14 items-center justify-between border-b px-4 md:px-6 print:hidden">
          <div className="flex items-center gap-3 md:hidden">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger render={<Button variant="ghost" size="icon" aria-label="Open menu" />}>
                <Menu className="size-5" />
              </SheetTrigger>
              <SheetContent side="left" className="w-60 flex flex-col p-0 gap-0">
                <div className="flex h-14 items-center gap-2.5 border-b px-4">
                  <Image
                    src="/logo_1.webp"
                    alt="OOWAPP"
                    width={24}
                    height={24}
                    className="rounded-md shrink-0"
                  />
                  <SheetTitle className="text-sm font-semibold truncate">{shopName}</SheetTitle>
                </div>
                <div className="flex-1 overflow-y-auto p-3">
                  <SidebarContent
                    pathname={pathname}
                    shopSlug={shopSlug}
                    onNavigate={() => setMobileOpen(false)}
                    onLogout={handleLogout}
                    foodBusiness={isFoodBusiness}
                    copy={copy}
                    navEntries={navEntries}
                  />
                </div>
              </SheetContent>
            </Sheet>
            <span className="text-sm font-semibold text-foreground">{pageTitle}</span>
          </div>
          <div className="hidden md:flex items-center">
            <span className="text-sm font-medium text-muted-foreground">{pageTitle}</span>
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell initialNotifications={initialNotifications} />
            <InstallApp />
            <ThemeToggle />
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
