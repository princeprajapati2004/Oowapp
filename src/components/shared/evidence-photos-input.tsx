"use client";

import { ImageUploader } from "./image-uploader";

/**
 * Up-to-`max` photos for one field — built as a thin wrapper around N
 * ImageUploader instances rather than teaching that shared primitive
 * multi-select semantics it was never designed for, so every single-image
 * caller (shop logo, category image, product cover) keeps its contract
 * exactly as-is. Originally built for return evidence photos; also used by
 * the product gallery (see products-manager.tsx) with a different itemLabel.
 */
export function EvidencePhotosInput({
  urls,
  onChange,
  endpoint,
  max = 3,
  itemLabel = "Evidence photo",
  addLabel = "Add photo",
}: {
  urls: string[];
  onChange: (urls: string[]) => void;
  endpoint: string;
  max?: number;
  itemLabel?: string;
  addLabel?: string;
}) {
  function setAt(i: number, url: string | null) {
    const next = [...urls];
    if (url) next[i] = url;
    else next.splice(i, 1);
    onChange(next);
  }

  return (
    <div className="flex flex-wrap gap-3">
      {urls.map((url, i) => (
        <ImageUploader key={`${i}-${url}`} value={url} onChange={(u) => setAt(i, u)} endpoint={endpoint} label={`${itemLabel} ${i + 1}`} />
      ))}
      {urls.length < max && (
        <ImageUploader value={null} onChange={(u) => u && onChange([...urls, u])} endpoint={endpoint} label={addLabel} />
      )}
    </div>
  );
}
