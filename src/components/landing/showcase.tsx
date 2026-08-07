"use client";

import { useState } from "react";
import { FadeIn, motion, AnimatePresence as AP } from "./motion";
import {
  LayoutDashboardIcon,
  UtensilsIcon,
  QrCodeIcon,
  ReceiptIcon,
} from "lucide-react";

const tabs = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboardIcon },
  { id: "menu", label: "Menu", icon: UtensilsIcon },
  { id: "qr", label: "QR Order", icon: QrCodeIcon },
  { id: "bill", label: "Billing", icon: ReceiptIcon },
];

function DashboardScreen() {
  return (
    <div className="p-4 space-y-3 h-full">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold">Good morning 👋</div>
          <div className="text-[10px] text-muted-foreground">Pizza Palace · Live</div>
        </div>
        <div className="size-7 rounded-full bg-primary/10 flex items-center justify-center text-primary text-[10px] font-bold">
          PP
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[
          { l: "Revenue", v: "₹12,480", c: "text-primary" },
          { l: "Orders", v: "47", c: "text-foreground" },
          { l: "Tables", v: "8/12", c: "text-foreground" },
        ].map((s) => (
          <div key={s.l} className="bg-muted/40 rounded-lg p-2 border border-border/40">
            <div className="text-[8px] text-muted-foreground mb-0.5">{s.l}</div>
            <div className={`text-xs font-bold ${s.c}`}>{s.v}</div>
          </div>
        ))}
      </div>
      <div className="bg-muted/30 rounded-xl p-3 border border-border/40">
        <div className="text-[9px] text-muted-foreground mb-2 font-medium">Today's Revenue</div>
        <div className="flex items-end gap-0.5 h-10">
          {[25, 45, 35, 65, 55, 80, 70, 90, 60, 75, 95, 68].map((h, i) => (
            <div
              key={i}
              className="flex-1 rounded-sm"
              style={{
                height: `${h}%`,
                backgroundColor: i > 9 ? "oklch(0.596 0.145 163.23)" : "oklch(0.596 0.145 163.23 / 0.25)",
              }}
            />
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        <div className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide">Recent Orders</div>
        {[
          { t: "T-5", i: "3 items", s: "Ready", a: "₹480" },
          { t: "T-2", i: "5 items", s: "Preparing", a: "₹820" },
          { t: "T-8", i: "2 items", s: "Paid", a: "₹260" },
        ].map((o) => (
          <div key={o.t} className="flex items-center justify-between bg-background/80 rounded-lg px-2.5 py-1.5 border border-border/40">
            <div className="flex items-center gap-1.5">
              <div className="size-5 rounded bg-primary/10 text-primary text-[8px] font-bold flex items-center justify-center">{o.t}</div>
              <span className="text-[9px] text-muted-foreground">{o.i}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`text-[8px] px-1.5 py-0.5 rounded font-medium ${o.s === "Ready" ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50" : o.s === "Preparing" ? "bg-amber-50 text-amber-600 dark:bg-amber-950/50" : "bg-muted text-muted-foreground"}`}>{o.s}</span>
              <span className="text-[9px] font-bold">{o.a}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MenuScreen() {
  return (
    <div className="p-4 space-y-3 h-full">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold">Pizza Palace</div>
          <div className="text-[9px] text-muted-foreground">Table 5 · Scan to order</div>
        </div>
        <div className="bg-primary/10 rounded-lg px-2 py-1 text-primary text-[9px] font-medium">Cart (2)</div>
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {["All", "Starters", "Pizza", "Drinks", "Desserts"].map((c, i) => (
          <span key={c} className={`shrink-0 text-[9px] px-2.5 py-1 rounded-full font-medium ${i === 2 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{c}</span>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {[
          { name: "Margherita", price: "₹280", tag: "🍕" },
          { name: "Pepperoni", price: "₹340", tag: "🍕" },
          { name: "BBQ Chicken", price: "₹380", tag: "🍕", added: true },
          { name: "Veggie Delight", price: "₹260", tag: "🍕" },
        ].map((item) => (
          <div key={item.name} className="bg-card border border-border/50 rounded-xl overflow-hidden">
            <div className="bg-muted/40 h-12 flex items-center justify-center text-2xl">{item.tag}</div>
            <div className="p-2">
              <div className="text-[9px] font-semibold leading-tight">{item.name}</div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-[9px] text-primary font-bold">{item.price}</span>
                <div className={`size-4 rounded flex items-center justify-center text-[8px] font-bold ${item.added ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                  {item.added ? "✓" : "+"}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="bg-primary text-primary-foreground rounded-xl py-2 text-[10px] font-bold text-center">
        View cart · ₹760
      </div>
    </div>
  );
}

function QRScreen() {
  return (
    <div className="p-4 flex flex-col items-center h-full">
      <div className="text-xs font-semibold mb-0.5">Pizza Palace</div>
      <div className="text-[9px] text-muted-foreground mb-4">Table 5</div>
      <div className="p-4 bg-white rounded-2xl border border-border/60 shadow-sm mb-4">
        <svg viewBox="0 0 60 60" className="w-24 h-24" fill="currentColor">
          <rect x="2" y="2" width="20" height="20" rx="2" fill="oklch(0.596 0.145 163.23 / 0.15)" />
          <rect x="5" y="5" width="14" height="14" rx="1" fill="oklch(0.596 0.145 163.23)" />
          <rect x="38" y="2" width="20" height="20" rx="2" fill="oklch(0.596 0.145 163.23 / 0.15)" />
          <rect x="41" y="5" width="14" height="14" rx="1" fill="oklch(0.596 0.145 163.23)" />
          <rect x="2" y="38" width="20" height="20" rx="2" fill="oklch(0.596 0.145 163.23 / 0.15)" />
          <rect x="5" y="41" width="14" height="14" rx="1" fill="oklch(0.596 0.145 163.23)" />
          <rect x="25" y="2" width="2" height="2" fill="oklch(0.596 0.145 163.23)" />
          <rect x="28" y="5" width="2" height="2" fill="oklch(0.596 0.145 163.23)" />
          <rect x="31" y="2" width="3" height="2" fill="oklch(0.596 0.145 163.23)" />
          <rect x="25" y="8" width="5" height="2" fill="oklch(0.596 0.145 163.23)" />
          <rect x="32" y="8" width="2" height="4" fill="oklch(0.596 0.145 163.23)" />
          <rect x="25" y="25" width="8" height="2" fill="oklch(0.596 0.145 163.23)" />
          <rect x="35" y="25" width="2" height="8" fill="oklch(0.596 0.145 163.23)" />
          <rect x="25" y="35" width="5" height="2" fill="oklch(0.596 0.145 163.23)" />
          <rect x="38" y="25" width="8" height="2" fill="oklch(0.596 0.145 163.23)" />
          <rect x="46" y="28" width="2" height="6" fill="oklch(0.596 0.145 163.23)" />
          <rect x="50" y="25" width="8" height="2" fill="oklch(0.596 0.145 163.23)" />
          <rect x="38" y="32" width="8" height="2" fill="oklch(0.596 0.145 163.23)" />
          <rect x="50" y="32" width="8" height="2" fill="oklch(0.596 0.145 163.23)" />
          <rect x="38" y="45" width="2" height="8" fill="oklch(0.596 0.145 163.23)" />
          <rect x="42" y="38" width="2" height="8" fill="oklch(0.596 0.145 163.23)" />
          <rect x="46" y="45" width="2" height="8" fill="oklch(0.596 0.145 163.23)" />
          <rect x="50" y="38" width="8" height="2" fill="oklch(0.596 0.145 163.23)" />
          <rect x="50" y="42" width="2" height="4" fill="oklch(0.596 0.145 163.23)" />
          <rect x="54" y="45" width="4" height="2" fill="oklch(0.596 0.145 163.23)" />
          <rect x="9" y="9" width="6" height="6" rx="1" fill="white" />
          <rect x="43" y="9" width="6" height="6" rx="1" fill="white" />
          <rect x="9" y="43" width="6" height="6" rx="1" fill="white" />
        </svg>
      </div>
      <div className="text-[10px] font-medium text-muted-foreground mb-1">Scan with your camera</div>
      <div className="text-[9px] text-muted-foreground text-center leading-relaxed">
        No app download needed.<br />Orders directly from your phone.
      </div>
      <div className="mt-auto w-full">
        <div className="text-[9px] text-muted-foreground text-center mb-2">Or staff can order for you</div>
        <div className="bg-muted/60 rounded-lg py-1.5 text-[9px] text-muted-foreground text-center">
          Call for assistance ↗
        </div>
      </div>
    </div>
  );
}

function BillScreen() {
  return (
    <div className="p-4 space-y-2.5 h-full">
      <div className="flex items-center justify-between border-b border-border/40 pb-2">
        <div>
          <div className="text-xs font-bold">Tax Invoice</div>
          <div className="text-[9px] text-muted-foreground">#INV-0482 · Table 5</div>
        </div>
        <div className="text-[9px] text-muted-foreground">Aug 6, 2026</div>
      </div>
      <div className="text-[8px] font-semibold text-muted-foreground uppercase tracking-wider">Pizza Palace</div>
      <div className="space-y-1.5">
        {[
          { name: "Margherita Pizza", qty: 1, price: "₹280" },
          { name: "BBQ Chicken Pizza", qty: 1, price: "₹380" },
          { name: "Cold Coffee", qty: 2, price: "₹180" },
        ].map((item) => (
          <div key={item.name} className="flex items-center justify-between">
            <div>
              <div className="text-[9px] font-medium">{item.name}</div>
              <div className="text-[8px] text-muted-foreground">×{item.qty}</div>
            </div>
            <div className="text-[9px] font-semibold">{item.price}</div>
          </div>
        ))}
      </div>
      <div className="border-t border-dashed border-border/60 pt-2 space-y-1">
        <div className="flex justify-between text-[9px]">
          <span className="text-muted-foreground">Subtotal</span>
          <span>₹840</span>
        </div>
        <div className="flex justify-between text-[9px]">
          <span className="text-muted-foreground">GST (5%)</span>
          <span>₹42</span>
        </div>
        <div className="flex justify-between text-[10px] font-bold border-t border-border/40 pt-1.5 mt-0.5">
          <span>Total</span>
          <span className="text-primary">₹882</span>
        </div>
      </div>
      <div className="space-y-1.5 pt-1">
        <div className="bg-primary text-primary-foreground rounded-lg py-2 text-[9px] font-bold text-center">
          Pay with UPI
        </div>
        <div className="bg-muted/60 rounded-lg py-1.5 text-[9px] text-muted-foreground font-medium text-center">
          Print / Download PDF
        </div>
      </div>
    </div>
  );
}

const screens: Record<string, React.ReactNode> = {
  dashboard: <DashboardScreen />,
  menu: <MenuScreen />,
  qr: <QRScreen />,
  bill: <BillScreen />,
};

export function ShowcaseSection() {
  const [active, setActive] = useState("dashboard");

  return (
    <section className="py-24 lg:py-32 bg-muted/20">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <FadeIn className="text-center mb-12">
          <span className="text-xs font-semibold uppercase tracking-widest text-primary mb-3 block">
            The App
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
            See Oowapp in action
          </h2>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto">
            Every screen designed for clarity, speed, and ease of use — for
            both business owners and their customers.
          </p>
        </FadeIn>

        <FadeIn>
          {/* Tab switcher */}
          <div className="flex justify-center gap-2 mb-8">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActive(tab.id)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium transition-all ${
                  active === tab.id
                    ? "bg-foreground text-background shadow-sm"
                    : "bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                <tab.icon size={13} />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Phone mockup */}
          <div className="flex justify-center">
            <div className="relative">
              {/* Phone frame */}
              <div className="w-64 rounded-[2.5rem] border-[3px] border-border/80 bg-background shadow-2xl overflow-hidden">
                {/* Notch */}
                <div className="bg-muted/30 pt-3 pb-2 flex justify-center border-b border-border/40">
                  <div className="w-16 h-1.5 bg-foreground/15 rounded-full" />
                </div>

                {/* Screen */}
                <div className="relative overflow-hidden" style={{ height: "480px" }}>
                  <AP mode="wait">
                    <motion.div
                      key={active}
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      transition={{ duration: 0.22, ease: "easeInOut" }}
                      className="absolute inset-0 overflow-y-auto"
                    >
                      {screens[active]}
                    </motion.div>
                  </AP>
                </div>

                {/* Bottom bar */}
                <div className="h-4 border-t border-border/40 bg-muted/20 flex justify-center items-center">
                  <div className="w-20 h-1 bg-foreground/15 rounded-full" />
                </div>
              </div>

              {/* Side glow */}
              <div
                className="absolute inset-0 rounded-[2.5rem] -z-10 blur-2xl opacity-20"
                style={{ background: "oklch(0.596 0.145 163.23)" }}
              />
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
