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
    <nav className="space-y-0.5">
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150",
              active
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Icon className={cn("size-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
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

  const currentItem = NAV_ITEMS.find(
    (item) => item.href === pathname || (item.href !== "/admin" && pathname.startsWith(item.href + "/"))
  );
  const pageTitle = currentItem?.label ?? "Dashboard";

  async function handleLogout() {
    await api.post("/api/auth/logout");
    router.push("/login");
    router.refresh();
  }

  const SidebarContent = ({ onNavigate }: { onNavigate?: () => void }) => (
    <>
      <NavLinks pathname={pathname} onNavigate={onNavigate} />
      <div className="mt-auto space-y-0.5 border-t pt-3">
        <Link
          href={`/order/${shopSlug}`}
          target="_blank"
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-all duration-150 hover:bg-muted hover:text-foreground"
        >
          <ExternalLink className="size-4 shrink-0" />
          Preview customer view
        </Link>
        <button
          onClick={() => { onNavigate?.(); handleLogout(); }}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-all duration-150 hover:bg-muted hover:text-foreground"
        >
          <LogOut className="size-4 shrink-0" />
          Log out
        </button>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen">
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
          <SidebarContent />
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
                  <SidebarContent onNavigate={() => setMobileOpen(false)} />
                </div>
              </SheetContent>
            </Sheet>
            <span className="text-sm font-semibold text-foreground">{pageTitle}</span>
          </div>
          <div className="hidden md:flex items-center">
            <span className="text-sm font-medium text-muted-foreground">{pageTitle}</span>
          </div>
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
