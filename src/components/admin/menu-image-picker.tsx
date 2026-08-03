"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { ImageOff, Loader2, Search, Upload } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api-client";

interface MenuImageRow {
  id: string;
  url: string;
  name: string;
}

interface MenuImagePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (url: string) => void;
  suggestedName?: string;
}

export function MenuImagePicker({ open, onOpenChange, onSelect, suggestedName }: MenuImagePickerProps) {
  const [images, setImages] = useState<MenuImageRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    async function load() {
      setLoading(true);
      try {
        const rows = await api.get<MenuImageRow[]>("/api/admin/menu-images");
        setImages(rows);
      } catch {
        toast.error("Couldn't load your image library");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [open]);

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Upload failed");

      const name = suggestedName || file.name.replace(/\.[^.]+$/, "");
      const saved = await api.post<MenuImageRow>("/api/admin/menu-images", { url: body.url, name });
      setImages((prev) => [saved, ...prev]);
      onSelect(saved.url);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const filtered = images.filter((img) => img.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Choose an image</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search your images..."
                className="pl-8"
              />
            </div>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUpload(file);
                e.target.value = "";
              }}
            />
            <Button type="button" variant="outline" onClick={() => inputRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              Upload new
            </Button>
          </div>

          <div className="grid max-h-80 grid-cols-4 gap-2 overflow-y-auto">
            {loading ? (
              <p className="col-span-4 py-8 text-center text-sm text-muted-foreground">Loading…</p>
            ) : filtered.length === 0 ? (
              <div className="col-span-4 flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
                <ImageOff className="size-6" />
                No images yet — upload one to add it to your library.
              </div>
            ) : (
              filtered.map((img) => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => {
                    onSelect(img.url);
                    onOpenChange(false);
                  }}
                  className={cn(
                    "group relative aspect-square overflow-hidden rounded-lg border bg-muted/40",
                    "hover:ring-2 hover:ring-primary"
                  )}
                  title={img.name}
                >
                  <Image src={img.url} alt={img.name} fill className="object-cover" unoptimized />
                </button>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
