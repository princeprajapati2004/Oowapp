import Link from "next/link";
import Image from "next/image";

const footerLinks = {
  Product: [
    { label: "Features", href: "#features" },
    { label: "How It Works", href: "#how-it-works" },
    { label: "Business Types", href: "#businesses" },
    { label: "Pricing", href: "#pricing" },
  ],
  Company: [
    { label: "About", href: "#about" },
    { label: "Contact", href: "mailto:hello@oowapp.in" },
    { label: "Privacy Policy", href: "/privacy" },
    { label: "Terms of Service", href: "/terms" },
  ],
  Account: [
    { label: "Log in", href: "/login" },
    { label: "Create account", href: "/admin/signup" },
    { label: "Staff login", href: "/staff/login" },
  ],
};

export function LandingFooter() {
  return (
    <footer className="border-t border-border/60 bg-muted/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="grid grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr] gap-10 mb-12">
          {/* Brand */}
          <div className="col-span-2 lg:col-span-1">
            <Link href="/" className="flex items-center gap-2.5 mb-4">
              <Image
                src="/logo_1.webp"
                alt="Oowapp"
                width={28}
                height={28}
                className="rounded-lg"
              />
              <span className="font-bold text-sm tracking-tight">Oowapp</span>
            </Link>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
              The operating system for local businesses. Take orders, accept
              payments, and manage your business — all in one place.
            </p>
            <div className="mt-5 flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-primary" />
              <span className="text-xs text-muted-foreground font-medium">
                Made in India 🇮🇳
              </span>
            </div>
          </div>

          {/* Links */}
          {Object.entries(footerLinks).map(([group, links]) => (
            <div key={group}>
              <div className="text-xs font-semibold uppercase tracking-widest text-foreground mb-4">
                {group}
              </div>
              <ul className="space-y-2.5">
                {links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom row */}
        <div className="border-t border-border/60 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Oowapp. All rights reserved.
          </p>
          <p className="text-xs text-muted-foreground">
            hello@oowapp.in · oowapp.in
          </p>
        </div>
      </div>
    </footer>
  );
}
