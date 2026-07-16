"use client";

import { useState } from "react";
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
  Menu,
  LogOut,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { InstallApp } from "@/components/shared/install-app";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api-client";

const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/settings", label: "Settings", icon: Settings },
  { href: "/admin/categories", label: "Categories", icon: FolderTree },
  { href: "/admin/products", label: "Products", icon: UtensilsCrossed },
  { href: "/admin/taxes", label: "Taxes", icon: Percent },
  { href: "/admin/qr", label: "QR Code", icon: QrCode },
  { href: "/admin/orders", label: "Orders", icon: ClipboardList },
];

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="space-y-1">
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Icon className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AdminShell({
  shopName,
  shopSlug,
  children,
}: {
  shopName: string;
  shopSlug: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  async function handleLogout() {
    await api.post("/api/auth/logout");
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen">
      <aside className="hidden md:flex w-64 shrink-0 flex-col border-r bg-background p-4 print:hidden">
        <div className="mb-6 px-2 flex items-center gap-2.5">
          <Image
            src="/logo_1.webp"
            alt="OOWAPP"
            width={32}
            height={32}
            className="rounded-lg shrink-0"
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{shopName}</p>
            <p className="text-xs text-muted-foreground truncate">/order/{shopSlug}</p>
          </div>
        </div>
        <NavLinks pathname={pathname} />
        <div className="mt-auto space-y-1 pt-4">
          <Link
            href={`/order/${shopSlug}`}
            target="_blank"
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ExternalLink className="size-4" />
            Preview customer view
          </Link>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <LogOut className="size-4" />
            Log out
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center justify-between border-b px-4 py-3 md:px-6 print:hidden">
          <div className="flex items-center gap-2 md:hidden">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger render={<Button variant="ghost" size="icon" aria-label="Open menu" />}>
                <Menu className="size-5" />
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-4">
                <SheetTitle className="mb-4 px-2 flex items-center gap-2.5 text-sm font-semibold">
                  <Image
                    src="/logo_1.webp"
                    alt="OOWAPP"
                    width={24}
                    height={24}
                    className="rounded-md shrink-0"
                  />
                  <span className="truncate">{shopName}</span>
                </SheetTitle>
                <NavLinks pathname={pathname} onNavigate={() => setMobileOpen(false)} />
                <div className="mt-4 space-y-1 border-t pt-4">
                  <Link
                    href={`/order/${shopSlug}`}
                    target="_blank"
                    className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <ExternalLink className="size-4" />
                    Preview customer view
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <LogOut className="size-4" />
                    Log out
                  </button>
                </div>
              </SheetContent>
            </Sheet>
            <p className="text-sm font-semibold truncate">{shopName}</p>
          </div>
          <div className="hidden md:block" />
          <div className="flex items-center gap-2">
            <InstallApp />
            <ThemeToggle />
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
