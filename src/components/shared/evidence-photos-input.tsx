"use client";

import { ImageUploader } from "./image-uploader";

/**
 * Up-to-`max` return-evidence photos — built as a thin wrapper around N
 * ImageUploader instances rather than teaching that shared primitive
 * multi-select semantics it was never designed for, so every other caller
 * (products, categories, shop logo) keeps its single-image contract exactly
 * as-is.
 */
export function EvidencePhotosInput({
  urls,
  onChange,
  endpoint,
  max = 3,
}: {
  urls: string[];
  onChange: (urls: string[]) => void;
  endpoint: string;
  max?: number;
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
        <ImageUploader key={`${i}-${url}`} value={url} onChange={(u) => setAt(i, u)} endpoint={endpoint} label={`Evidence photo ${i + 1}`} />
      ))}
      {urls.length < max && (
        <ImageUploader value={null} onChange={(u) => u && onChange([...urls, u])} endpoint={endpoint} label="Add photo" />
      )}
    </div>
  );
}
