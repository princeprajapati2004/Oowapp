"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  Pencil,
  Trash2,
  ShieldCheck,
  Phone,
  MessageCircle,
  Mail,
  ChefHat,
  UtensilsCrossed,
  ReceiptText,
  Calendar,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormRow } from "@/components/shared/form-row";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { api, ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils";

type StaffRole = "MANAGER" | "KITCHEN" | "WAITER";

interface StaffMember {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: StaffRole;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  orderCount: number;
}

interface RecentOrder {
  id: string;
  billNumber: string;
  grandTotal: number;
  status: string;
  paymentMethod: string | null;
  createdAt: string;
}

const ROLE_LABELS: Record<StaffRole, string> = {
  MANAGER: "Manager",
  KITCHEN: "Kitchen",
  WAITER: "Waiter",
};

const ROLE_ICONS: Record<StaffRole, React.ComponentType<{ className?: string }>> = {
  MANAGER: ShieldCheck,
  KITCHEN: ChefHat,
  WAITER: UtensilsCrossed,
};

const ROLE_BADGE: Record<StaffRole, string> = {
  MANAGER: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  KITCHEN: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  WAITER: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
};

const STATUS_BADGE: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  CONFIRMED: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  PREPARING: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
  READY: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  COMPLETED: "bg-muted text-muted-foreground",
  CANCELLED: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

function waLink(phone: string) {
  return `https://wa.me/${phone.replace(/[^\d]/g, "")}`;
}

export function StaffProfile({
  initialMember,
  recentOrders,
  currency,
}: {
  initialMember: StaffMember;
  recentOrders: RecentOrder[];
  currency: string;
}) {
  const [member, setMember] = useState(initialMember);
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState({ name: member.name, email: member.email ?? "", phone: member.phone ?? "", role: member.role, password: "" });
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const Icon = ROLE_ICONS[member.role];

  function openEdit() {
    setForm({ name: member.name, email: member.email ?? "", phone: member.phone ?? "", role: member.role, password: "" });
    setEditOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) {
      toast.error("Name and email are required");
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { name: form.name, email: form.email, phone: form.phone, role: form.role };
      if (form.password) payload.password = form.password;
      const updated = await api.patch<StaffMember>(`/api/admin/staff/${member.id}`, payload);
      setMember(updated);
      toast.success("Staff updated");
      setEditOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update staff");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive() {
    try {
      const updated = await api.patch<StaffMember>(`/api/admin/staff/${member.id}`, { isActive: !member.isActive });
      setMember(updated);
      toast.success(updated.isActive ? "Staff activated" : "Staff deactivated");
    } catch {
      toast.error("Failed to update");
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await api.delete(`/api/admin/staff/${member.id}`);
      toast.success("Staff removed");
      window.location.href = "/admin/staff";
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to delete");
      setDeleting(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="shrink-0" render={<Link href="/admin/staff" />} nativeButton={false}>
          <ArrowLeft className="size-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold truncate">{member.name}</h1>
          <p className="text-sm text-muted-foreground">{ROLE_LABELS[member.role]}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {member.phone && (
          <>
            <Button variant="outline" size="sm" className="h-9 gap-1.5" render={<a href={`tel:${member.phone}`} />} nativeButton={false}>
              <Phone className="size-4" /> Call
            </Button>
            <Button variant="outline" size="sm" className="h-9 gap-1.5" render={<a href={waLink(member.phone)} target="_blank" rel="noopener noreferrer" />} nativeButton={false}>
              <MessageCircle className="size-4" /> WhatsApp
            </Button>
          </>
        )}
        <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={openEdit}>
          <Pencil className="size-4" /> Edit
        </Button>
        <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={toggleActive}>
          <ShieldCheck className={cn("size-4", member.isActive && "text-emerald-500")} />
          {member.isActive ? "Deactivate" : "Activate"}
        </Button>
        <Button variant="outline" size="sm" className="h-9 gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => setDeleteOpen(true)}>
          <Trash2 className="size-4" /> Delete
        </Button>
      </div>

      {/* Profile card */}
      <div className="rounded-2xl border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b bg-muted/30 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-muted">
              <Icon className="size-6 text-muted-foreground" />
            </div>
            <div className="space-y-1 text-sm">
              {member.email && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="size-3.5" /> {member.email}
                </div>
              )}
              {member.phone && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="size-3.5" /> {member.phone}
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", ROLE_BADGE[member.role])}>
              {ROLE_LABELS[member.role]}
            </span>
            <Badge variant={member.isActive ? "secondary" : "outline"} className="text-xs">
              {member.isActive ? "Active" : "Inactive"}
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-3 divide-x">
          <div className="px-4 py-4 text-center">
            <p className="text-lg font-bold tabular-nums">{member.orderCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Orders Served</p>
          </div>
          <div className="px-4 py-4 text-center">
            <p className="text-sm font-semibold flex items-center justify-center gap-1">
              <Calendar className="size-3.5 text-muted-foreground" />
              {new Date(member.createdAt).toLocaleDateString(undefined, { month: "short", year: "numeric" })}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Member since</p>
          </div>
          <div className="px-4 py-4 text-center">
            <p className="text-sm font-semibold flex items-center justify-center gap-1">
              <Clock className="size-3.5 text-muted-foreground" />
              {member.lastLoginAt
                ? new Date(member.lastLoginAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })
                : "Never"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Last login</p>
          </div>
        </div>
      </div>

      {/* Recent orders */}
      <div className="rounded-xl border overflow-hidden">
        <div className="bg-muted/30 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Recent Orders
        </div>
        {recentOrders.length === 0 ? (
          <EmptyState
            icon={ReceiptText}
            title="No orders yet"
            description={`Orders ${member.name} creates or serves will show up here.`}
          />
        ) : (
          <div className="divide-y">
            {recentOrders.map((order) => (
              <Link
                key={order.id}
                href={`/admin/orders/${order.id}`}
                className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-muted/40 transition-colors"
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
                  <ReceiptText className="size-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{order.billNumber}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(order.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-semibold tabular-nums">{formatCurrency(order.grandTotal, currency)}</p>
                  <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium", STATUS_BADGE[order.status] ?? "bg-muted text-muted-foreground")}>
                    {order.status}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Staff Member</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <FormRow label="Name" htmlFor="sp-name" required>
              <Input id="sp-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </FormRow>
            <FormRow label="Email" htmlFor="sp-email" required>
              <Input id="sp-email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </FormRow>
            <FormRow label="Phone" htmlFor="sp-phone">
              <Input id="sp-phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+91 ..." />
            </FormRow>
            <FormRow label="Role" htmlFor="sp-role" required>
              <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: (v as StaffRole) ?? f.role }))}>
                <SelectTrigger id="sp-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="WAITER">Waiter</SelectItem>
                  <SelectItem value="KITCHEN">Kitchen</SelectItem>
                  <SelectItem value="MANAGER">Manager</SelectItem>
                </SelectContent>
              </Select>
            </FormRow>
            <FormRow label="New password (leave blank to keep)" htmlFor="sp-pass">
              <Input id="sp-pass" type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder="••••••••" />
            </FormRow>
            <div className="flex gap-2 pt-1">
              <Button type="submit" disabled={saving} className="flex-1">
                {saving ? "Saving…" : "Save changes"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Remove staff member?"
        description={`${member.name} will be removed. This cannot be undone.`}
        onConfirm={handleDelete}
        confirmLabel={deleting ? "Removing…" : "Remove"}
        destructive
      />
    </div>
  );
}
