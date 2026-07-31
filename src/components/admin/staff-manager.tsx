"use client";

import { useState } from "react";
import Link from "next/link";
import { UserPlus, Pencil, Trash2, ChefHat, UtensilsCrossed, ShieldCheck, Phone, MessageCircle, ReceiptText, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Badge } from "@/components/ui/badge";
import { FormRow } from "@/components/shared/form-row";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { api, ApiError } from "@/lib/api-client";

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

function waLink(phone: string) {
  return `https://wa.me/${phone.replace(/[^\d]/g, "")}`;
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

interface StaffFormData {
  name: string;
  email: string;
  phone: string;
  role: StaffRole;
  password: string;
}

function StaffDialog({
  open,
  onOpenChange,
  initial,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: Partial<StaffMember>;
  onSave: (data: StaffFormData) => Promise<void>;
}) {
  const [form, setForm] = useState<StaffFormData>({
    name: initial?.name ?? "",
    email: initial?.email ?? "",
    phone: initial?.phone ?? "",
    role: initial?.role ?? "WAITER",
    password: "",
  });
  const [saving, setSaving] = useState(false);
  const isEdit = !!initial?.id;

  function set(key: keyof StaffFormData, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) {
      toast.error("Name and email are required");
      return;
    }
    if (!isEdit && !form.password) {
      toast.error("Password is required for new staff");
      return;
    }
    setSaving(true);
    try {
      await onSave(form);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Staff Member" : "Add Staff Member"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormRow label="Name" htmlFor="s-name" required>
            <Input id="s-name" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Full name" />
          </FormRow>
          <FormRow label="Email" htmlFor="s-email" required>
            <Input id="s-email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="staff@example.com" />
          </FormRow>
          <FormRow label="Phone" htmlFor="s-phone">
            <Input id="s-phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+91 ..." />
          </FormRow>
          <FormRow label="Role" htmlFor="s-role" required>
            <Select value={form.role} onValueChange={(v) => set("role", v as StaffRole)}>
              <SelectTrigger id="s-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="WAITER">Waiter</SelectItem>
                <SelectItem value="KITCHEN">Kitchen</SelectItem>
                <SelectItem value="MANAGER">Manager</SelectItem>
              </SelectContent>
            </Select>
          </FormRow>
          <FormRow label={isEdit ? "New password (leave blank to keep)" : "Password"} htmlFor="s-pass" required={!isEdit}>
            <Input id="s-pass" type="password" value={form.password} onChange={(e) => set("password", e.target.value)} placeholder="••••••••" />
          </FormRow>
          <div className="flex gap-2 pt-1">
            <Button type="submit" disabled={saving} className="flex-1">
              {saving ? "Saving…" : isEdit ? "Save changes" : "Add staff"}
            </Button>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function StaffManager({ initialStaff }: { initialStaff: StaffMember[] }) {
  const [staff, setStaff] = useState(initialStaff);
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<StaffMember | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StaffMember | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleAdd(data: StaffFormData) {
    try {
      const created = await api.post<StaffMember>("/api/admin/staff", data);
      setStaff((prev) => [...prev, created]);
      toast.success("Staff member added");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to add staff");
      throw err;
    }
  }

  async function handleEdit(data: StaffFormData) {
    if (!editTarget) return;
    try {
      const payload: Record<string, unknown> = { ...data };
      if (!payload.password) delete payload.password;
      const updated = await api.patch<StaffMember>(`/api/admin/staff/${editTarget.id}`, payload);
      setStaff((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      toast.success("Staff updated");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update staff");
      throw err;
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/api/admin/staff/${deleteTarget.id}`);
      setStaff((prev) => prev.filter((s) => s.id !== deleteTarget.id));
      toast.success("Staff removed");
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to delete");
    } finally {
      setDeleting(false);
    }
  }

  async function toggleActive(member: StaffMember) {
    try {
      const updated = await api.patch<StaffMember>(`/api/admin/staff/${member.id}`, { isActive: !member.isActive });
      setStaff((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      toast.success(updated.isActive ? "Staff activated" : "Staff deactivated");
    } catch {
      toast.error("Failed to update");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{staff.length} staff member{staff.length !== 1 ? "s" : ""}</p>
        <Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
          <UserPlus className="size-4" /> Add Staff
        </Button>
      </div>

      {staff.length === 0 ? (
        <EmptyState
          icon={UserPlus}
          title="No staff members yet"
          description="Add your first staff member to get started."
          action={<Button onClick={() => setAddOpen(true)}>Add Staff</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {staff.map((member) => {
            const Icon = ROLE_ICONS[member.role];
            return (
              <div
                key={member.id}
                className="rounded-xl border bg-card p-4 space-y-3 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"
              >
                <Link href={`/admin/staff/${member.id}`} className="flex items-start gap-3">
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted">
                    <Icon className="size-5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm truncate">{member.name}</p>
                    {member.email && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground truncate">
                        <Mail className="size-3 shrink-0" /> {member.email}
                      </div>
                    )}
                    {member.phone && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Phone className="size-3 shrink-0" /> {member.phone}
                      </div>
                    )}
                  </div>
                </Link>

                <div className="flex flex-wrap items-center gap-1">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${ROLE_BADGE[member.role]}`}>
                    {ROLE_LABELS[member.role]}
                  </span>
                  <Badge variant={member.isActive ? "secondary" : "outline"} className="text-xs">
                    {member.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>

                <div className="flex items-center justify-between border-t pt-2.5">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <ReceiptText className="size-3.5" />
                    {member.orderCount} order{member.orderCount !== 1 ? "s" : ""} served
                  </div>
                  <div className="flex items-center gap-0.5">
                    {member.phone && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          render={<a href={`tel:${member.phone}`} />}
                          nativeButton={false}
                          aria-label="Call"
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <Phone className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          render={<a href={waLink(member.phone)} target="_blank" rel="noopener noreferrer" />}
                          nativeButton={false}
                          aria-label="WhatsApp"
                          className="text-muted-foreground hover:text-emerald-600"
                        >
                          <MessageCircle className="size-3.5" />
                        </Button>
                      </>
                    )}
                    <Button variant="ghost" size="icon-sm" onClick={() => setEditTarget(member)} aria-label="Edit" className="text-muted-foreground hover:text-foreground">
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => toggleActive(member)}
                      aria-label={member.isActive ? "Deactivate" : "Activate"}
                      title={member.isActive ? "Deactivate" : "Activate"}
                    >
                      <ShieldCheck className={`size-3.5 ${member.isActive ? "text-emerald-500" : ""}`} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => setDeleteTarget(member)}
                      aria-label="Delete"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <StaffDialog open={addOpen} onOpenChange={setAddOpen} onSave={handleAdd} />
      {editTarget && (
        <StaffDialog
          open={!!editTarget}
          onOpenChange={(open) => { if (!open) setEditTarget(null); }}
          initial={editTarget}
          onSave={handleEdit}
        />
      )}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Remove staff member?"
        description={`${deleteTarget?.name} will be removed. This cannot be undone.`}
        onConfirm={handleDelete}
        confirmLabel={deleting ? "Removing…" : "Remove"}
        destructive
      />
    </div>
  );
}
