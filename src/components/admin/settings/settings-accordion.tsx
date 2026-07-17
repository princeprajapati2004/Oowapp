"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AccordionItem {
  id: string;
  title: string;
  description?: string;
  content: ReactNode;
  defaultOpen?: boolean;
  hidden?: boolean;
}

export function SettingsAccordion({ items }: { items: AccordionItem[] }) {
  const visible = items.filter((i) => !i.hidden);
  const [openId, setOpenId] = useState<string | null>(
    visible.find((i) => i.defaultOpen)?.id ?? visible[0]?.id ?? null
  );

  return (
    <div className="space-y-2">
      {visible.map((item) => {
        const isOpen = openId === item.id;
        return (
          <div
            key={item.id}
            className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10"
          >
            <button
              type="button"
              onClick={() => setOpenId(isOpen ? null : item.id)}
              className="flex w-full items-center justify-between px-4 py-4 text-left transition-colors hover:bg-muted/40"
              aria-expanded={isOpen}
            >
              <div className="min-w-0 flex-1 pr-4">
                <p className="font-heading text-base font-medium leading-snug">{item.title}</p>
                {item.description && (
                  <p className="mt-0.5 text-sm text-muted-foreground">{item.description}</p>
                )}
              </div>
              <ChevronDown
                className={cn(
                  "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
                  isOpen && "rotate-180"
                )}
              />
            </button>
            <div
              className={cn(
                "grid transition-[grid-template-rows] duration-200 ease-in-out",
                isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
              )}
            >
              <div className="overflow-hidden">
                <div className="border-t px-4 py-5 space-y-4">
                  {item.content}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
