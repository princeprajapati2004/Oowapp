"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { FormRow } from "@/components/shared/form-row";
import { api, ApiError } from "@/lib/api-client";
import type { Category } from "@/generated/prisma/client";

// Full-page Add/Edit Category — replaces the old centered Dialog in
// categories-manager.tsx (section: popup-to-full-page conversion, batch 1).
// Same back/header/footer language as create-order-page.tsx so every
// converted admin form reads consistently.
export function CategoryFormPage({ category }: { category?: Category }) {
  const router = useRouter();
  const isEditing = !!category;

  const [name, setName] = useState(category?.name ?? "");
  const [isVisible, setIsVisible] = useState(category?.isVisible ?? true);
  const [saving, setSaving] = useState(false);

  function goBack() {
    router.push("/admin/categories");
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      if (isEditing) {
        await api.patch(`/api/admin/categories/${category.id}`, { name, isVisible });
        toast.success("Category updated");
      } else {
        await api.post("/api/admin/categories", { name, isVisible });
        toast.success("Category added");
      }
      // Server Component list page needs a fresh fetch, not the Router
      // Cache's stale copy — same push+refresh pattern used throughout.
      router.push("/admin/categories");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-20 flex shrink-0 items-center gap-3 border-b bg-background/98 px-4 py-3 backdrop-blur-sm">
        <button
          onClick={goBack}
          aria-label="Back to categories"
          className="flex size-9 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-muted"
        >
          <ArrowLeft className="size-5" />
        </button>
        <h1 className="text-base font-semibold">{isEditing ? "Edit Category" : "Add Category"}</h1>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 space-y-4 px-4 py-6">
        <FormRow label="Name" htmlFor="category-name" required>
          <Input
            id="category-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Starters"
            autoFocus
          />
        </FormRow>
        <div className="flex items-center justify-between rounded-xl border bg-card px-4 py-3 transition-colors hover:bg-muted/40">
          <p className="text-sm font-medium select-none">Visible to customers</p>
          <Switch checked={isVisible} onCheckedChange={setIsVisible} />
        </div>
      </main>

      <div className="sticky bottom-0 z-20 flex shrink-0 items-center justify-end gap-2 border-t bg-background/98 px-4 py-3 backdrop-blur-sm">
        <Button variant="outline" onClick={goBack} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
