"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ArrowUp, ArrowDown, FolderTree } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { api, ApiError } from "@/lib/api-client";
import type { Category } from "@/generated/prisma/client";

export function CategoriesManager({ initialCategories }: { initialCategories: Category[] }) {
  const router = useRouter();
  const [categories, setCategories] = useState(initialCategories);
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);

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
        <Button onClick={() => router.push("/admin/categories/new")}>
          <Plus className="size-4" /> Add category
        </Button>
      </div>

      {categories.length === 0 ? (
        <EmptyState
          icon={FolderTree}
          title="No categories yet"
          description="Create your first category to start adding menu items."
          action={<Button onClick={() => router.push("/admin/categories/new")}>Add category</Button>}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card divide-y">
          {categories.map((category, index) => (
            <div key={category.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors">
              <div className="flex flex-col gap-0.5">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 rounded text-muted-foreground hover:text-foreground"
                  disabled={index === 0}
                  onClick={() => handleMove(index, -1)}
                  aria-label="Move up"
                >
                  <ArrowUp className="size-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 rounded text-muted-foreground hover:text-foreground"
                  disabled={index === categories.length - 1}
                  onClick={() => handleMove(index, 1)}
                  aria-label="Move down"
                >
                  <ArrowDown className="size-3" />
                </Button>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{category.name}</p>
                <p className="text-xs text-muted-foreground">{category.isVisible ? "Visible" : "Hidden"}</p>
              </div>
              <Switch
                checked={category.isVisible}
                onCheckedChange={() => handleToggleVisible(category)}
                aria-label="Visible to customers"
              />
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => router.push(`/admin/categories/${category.id}/edit`)}
                aria-label="Edit"
                className="text-muted-foreground hover:text-foreground"
              >
                <Pencil className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setDeleteTarget(category)}
                aria-label="Delete"
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

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
