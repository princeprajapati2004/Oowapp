"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ArrowUp, ArrowDown, FolderTree } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { FormRow } from "@/components/shared/form-row";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { api, ApiError } from "@/lib/api-client";
import type { Category } from "@/generated/prisma/client";

export function CategoriesManager({ initialCategories }: { initialCategories: Category[] }) {
  const [categories, setCategories] = useState(initialCategories);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [name, setName] = useState("");
  const [isVisible, setIsVisible] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);

  function openCreate() {
    setEditing(null);
    setName("");
    setIsVisible(true);
    setDialogOpen(true);
  }

  function openEdit(category: Category) {
    setEditing(category);
    setName(category.name);
    setIsVisible(category.isVisible);
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        const updated = await api.patch<Category>(`/api/admin/categories/${editing.id}`, {
          name,
          isVisible,
        });
        setCategories((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
        toast.success("Category updated");
      } else {
        const created = await api.post<Category>("/api/admin/categories", { name, isVisible });
        setCategories((prev) => [...prev, created]);
        toast.success("Category added");
      }
      setDialogOpen(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await api.delete(`/api/admin/categories/${deleteTarget.id}`);
      setCategories((prev) => prev.filter((c) => c.id !== deleteTarget.id));
      toast.success("Category deleted");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to delete");
    } finally {
      setDeleteTarget(null);
    }
  }

  async function handleToggleVisible(category: Category) {
    try {
      const updated = await api.patch<Category>(`/api/admin/categories/${category.id}`, {
        isVisible: !category.isVisible,
      });
      setCategories((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to update");
    }
  }

  async function handleMove(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= categories.length) return;
    const next = [...categories];
    [next[index], next[target]] = [next[target], next[index]];
    setCategories(next);
    await Promise.all(
      next.map((c, i) => api.patch(`/api/admin/categories/${c.id}`, { sortOrder: i }))
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Categories</h1>
          <p className="text-muted-foreground">Group your menu, e.g. Starters, Beverages.</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4" /> Add category
        </Button>
      </div>

      {categories.length === 0 ? (
        <EmptyState
          icon={FolderTree}
          title="No categories yet"
          description="Create your first category to start adding menu items."
          action={<Button onClick={openCreate}>Add category</Button>}
        />
      ) : (
        <div className="space-y-2">
          {categories.map((category, index) => (
            <div key={category.id} className="flex items-center gap-3 rounded-lg border p-3">
              <div className="flex flex-col">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6"
                  disabled={index === 0}
                  onClick={() => handleMove(index, -1)}
                  aria-label="Move up"
                >
                  <ArrowUp className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6"
                  disabled={index === categories.length - 1}
                  onClick={() => handleMove(index, 1)}
                  aria-label="Move down"
                >
                  <ArrowDown className="size-3.5" />
                </Button>
              </div>
              <p className="flex-1 font-medium truncate">{category.name}</p>
              <Switch
                checked={category.isVisible}
                onCheckedChange={() => handleToggleVisible(category)}
                aria-label="Visible to customers"
              />
              <Button variant="ghost" size="icon" onClick={() => openEdit(category)} aria-label="Edit">
                <Pencil className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setDeleteTarget(category)}
                aria-label="Delete"
              >
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit category" : "Add category"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <FormRow label="Name" htmlFor="category-name" required>
              <Input
                id="category-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Starters"
                autoFocus
              />
            </FormRow>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <p className="text-sm font-medium">Visible to customers</p>
              <Switch checked={isVisible} onCheckedChange={setIsVisible} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete category?"
        description={`This will also delete all products in "${deleteTarget?.name}". This can't be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
      />
    </div>
  );
}
