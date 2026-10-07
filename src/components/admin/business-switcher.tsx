"use client";

import { useState } from "react";
import { ChevronsUpDown, Plus, Check, Building2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BUSINESS_TYPES, BUSINESS_TYPE_LABELS, type BusinessType } from "@/lib/business-types";
import { api, ApiError } from "@/lib/api-client";

export interface BusinessSwitcherShop {
  id: string;
  businessName: string;
  slug: string;
}

export function BusinessSwitcher({
  shops,
  activeShopId,
}: {
  shops: BusinessSwitcherShop[];
  activeShopId: string;
}) {
  const [switching, setSwitching] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [businessType, setBusinessType] = useState<BusinessType>("RESTAURANT");
  const [whatsappNumber, setWhatsappNumber] = useState("");

  const activeShop = shops.find((s) => s.id === activeShopId) ?? shops[0];

  async function handleSwitch(shopId: string) {
    if (shopId === activeShopId || switching) return;
    setSwitching(true);
    try {
      await api.post("/api/admin/switch-business", { shopId });
      // Hard navigation (not router.refresh()) so SSE connections (notification
      // bell, live order streams) reconnect against the newly active business.
      window.location.href = "/admin";
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not switch business");
      setSwitching(false);
    }
  }

  async function handleAddBusiness() {
    if (!businessName.trim()) {
      toast.error("Business name is required");
      return;
    }
    if (!whatsappNumber.trim()) {
      toast.error("WhatsApp number is required");
      return;
    }
    setSaving(true);
    try {
      const { shop } = await api.post<{ shop: { id: string } }>("/api/admin/businesses", {
        businessName: businessName.trim(),
        businessType,
        whatsappNumber: whatsappNumber.trim(),
      });
      await api.post("/api/admin/switch-business", { shopId: shop.id });
      window.location.href = "/admin";
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not create business");
      setSaving(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md py-0.5 text-left transition-colors hover:bg-muted disabled:opacity-60"
              disabled={switching}
            />
          }
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-tight truncate">{activeShop?.businessName}</p>
            <p className="text-[11px] text-muted-foreground truncate">/order/{activeShop?.slug}</p>
          </div>
          {shops.length > 1 && <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <div className="px-1.5 py-1 text-xs font-medium text-muted-foreground">Your businesses</div>
          {shops.map((shop) => (
            <DropdownMenuItem key={shop.id} onClick={() => handleSwitch(shop.id)}>
              <Building2 className="size-3.5" />
              <span className="flex-1 truncate">{shop.businessName}</span>
              {shop.id === activeShopId && <Check className="size-3.5" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setAddOpen(true)}>
            <Plus className="size-3.5" />
            Add business
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a business</DialogTitle>
            <DialogDescription>
              Create another business under your account. You can switch between them anytime.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="add-business-name">Business name</Label>
              <Input
                id="add-business-name"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="e.g. My Second Shop"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Business type</Label>
              <Select value={businessType} onValueChange={(v) => v && setBusinessType(v as BusinessType)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select type">
                    {(value: string | null) =>
                      value ? BUSINESS_TYPE_LABELS[value as BusinessType] : "Select type"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {BUSINESS_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {BUSINESS_TYPE_LABELS[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-business-whatsapp">WhatsApp number</Label>
              <Input
                id="add-business-whatsapp"
                value={whatsappNumber}
                onChange={(e) => setWhatsappNumber(e.target.value)}
                placeholder="e.g. 919876543210"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleAddBusiness} disabled={saving}>
              {saving ? "Creating..." : "Create business"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
