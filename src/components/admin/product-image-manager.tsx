"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Loader2, Plus, RotateCw, Star, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 4 * 1024 * 1024;

type PendingStatus = "uploading" | "failed";

interface PendingImage {
  id: string;
  file: File;
  status: PendingStatus;
}

interface ProductImageManagerProps {
  /** Already-uploaded image URLs. Index 0 is the primary/cover image. */
  images: string[];
  onChange: (images: string[]) => void;
  max?: number;
  endpoint?: string;
}

/**
 * True multi-select upload + primary/reorder/retry for a product's image
 * gallery. Index 0 of `images` is always the primary (cover) image — callers
 * split it back into `imageUrl`/`imageUrls` for the API, same convention as
 * Product.imageUrl + Product.imageUrls in the schema.
 */
export function ProductImageManager({ images, onChange, max = 8, endpoint = "/api/upload" }: ProductImageManagerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<PendingImage[]>([]);

  const activeCount = images.length + pending.length;
  const atMax = activeCount >= max;

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const room = Math.max(0, max - activeCount);
    const selected = Array.from(files);
    const toAdd = selected.slice(0, room);
    if (selected.length > toAdd.length) {
      toast.error(`Maximum ${max} images allowed — only the first ${toAdd.length} were added.`);
    }
    const next: PendingImage[] = toAdd.map((file) => ({ id: crypto.randomUUID(), file, status: "uploading" }));
    setPending((p) => [...p, ...next]);
    next.forEach((item) => uploadOne(item));
  }

  async function uploadOne(item: PendingImage) {
    try {
      if (!ACCEPTED_TYPES.includes(item.file.type)) {
        throw new Error("Invalid image format. Use JPG, PNG, or WEBP.");
      }
      if (item.file.size > MAX_SIZE) {
        throw new Error("Image is too large. Maximum size is 4MB.");
      }
      const formData = new FormData();
      formData.append("file", item.file);
      const res = await fetch(endpoint, { method: "POST", body: formData });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Upload failed. Please try again.");
      setPending((p) => p.filter((x) => x.id !== item.id));
      onChange([...images, body.url]);
    } catch (error) {
      setPending((p) => p.map((x) => (x.id === item.id ? { ...x, status: "failed" } : x)));
      toast.error(error instanceof Error ? error.message : "Upload failed. Please try again.");
    }
  }

  function retry(id: string) {
    setPending((p) => {
      const item = p.find((x) => x.id === id);
      if (item) uploadOne({ ...item, status: "uploading" });
      return p.map((x) => (x.id === id ? { ...x, status: "uploading" } : x));
    });
  }

  function dismissFailed(id: string) {
    setPending((p) => p.filter((x) => x.id !== id));
  }

  function removeImage(index: number) {
    const url = images[index];
    onChange(images.filter((_, i) => i !== index));
    // Best-effort storage cleanup — never blocks the UI or the product save
    // on failure, see /api/upload's DELETE handler for the tenant-scoped check.
    fetch(endpoint, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    }).catch(() => {});
  }

  function setPrimary(index: number) {
    if (index === 0) return;
    const next = [...images];
    const [chosen] = next.splice(index, 1);
    next.unshift(chosen);
    onChange(next);
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= images.length) return;
    const next = [...images];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3">
        {images.map((url, i) => (
          <div key={`${url}-${i}`} className="w-24 space-y-1">
            <div className="relative size-24 overflow-hidden rounded-lg border bg-muted/40">
              <Image src={url} alt={`Product image ${i + 1}`} fill className="object-cover" unoptimized />
              {i === 0 && (
                <span className="absolute left-1 top-1 rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                  Primary
                </span>
              )}
              <button
                type="button"
                onClick={() => removeImage(i)}
                aria-label={`Remove image ${i + 1}`}
                className="absolute right-1 top-1 rounded-full bg-background/80 p-0.5 hover:bg-background"
              >
                <X className="size-3.5" />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                aria-label="Move left"
                className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
              >
                <ChevronLeft className="size-4" />
              </button>
              {i !== 0 ? (
                <button
                  type="button"
                  onClick={() => setPrimary(i)}
                  title="Set as primary"
                  aria-label="Set as primary"
                  className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                >
                  <Star className="size-3.5" />
                </button>
              ) : (
                <span className="size-3.5" />
              )}
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={i === images.length - 1}
                aria-label="Move right"
                className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>
        ))}

        {pending.map((item) => (
          <div
            key={item.id}
            className="flex size-24 flex-col items-center justify-center gap-1 rounded-lg border bg-muted/40 p-1 text-center"
          >
            {item.status === "uploading" ? (
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            ) : (
              <>
                <span className="text-[10px] font-medium text-destructive">Failed</span>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-6 px-1.5"
                    onClick={() => retry(item.id)}
                    aria-label="Retry upload"
                  >
                    <RotateCw className="size-3" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 px-1.5"
                    onClick={() => dismissFailed(item.id)}
                    aria-label="Dismiss failed upload"
                  >
                    <X className="size-3" />
                  </Button>
                </div>
              </>
            )}
          </div>
        ))}

        {!atMax && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className={cn(
              "flex size-24 flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-muted-foreground",
              "hover:bg-muted/40"
            )}
          >
            <Plus className="size-5" />
            <span className="text-[10px]">{images.length === 0 ? "Add Images" : "Add More"}</span>
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(",")}
        multiple
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />

      <p className="text-xs text-muted-foreground">
        {activeCount}/{max} images &middot; JPG, PNG, or WEBP, up to 4MB each. First image is primary.
      </p>
    </div>
  );
}
