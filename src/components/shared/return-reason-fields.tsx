"use client";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RETURN_REASONS, RETURN_REASON_LABELS, type ReturnReason } from "@/lib/return-status";
import { EvidencePhotosInput } from "./evidence-photos-input";

/** Shared reason/notes/evidence fields for both the owner and customer return-request forms. */
export function ReturnReasonFields({
  reason,
  onReasonChange,
  reasonOtherText,
  onReasonOtherTextChange,
  notes,
  onNotesChange,
  evidenceUrls,
  onEvidenceChange,
  uploadEndpoint,
}: {
  reason: ReturnReason;
  onReasonChange: (reason: ReturnReason) => void;
  reasonOtherText: string;
  onReasonOtherTextChange: (text: string) => void;
  notes: string;
  onNotesChange: (notes: string) => void;
  evidenceUrls: string[];
  onEvidenceChange: (urls: string[]) => void;
  uploadEndpoint: string;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs">Return Reason</Label>
        <Select value={reason} onValueChange={(v) => onReasonChange(v as ReturnReason)}>
          <SelectTrigger className="h-11 w-full">
            <SelectValue>{RETURN_REASON_LABELS[reason]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {RETURN_REASONS.map((r) => (
              <SelectItem key={r} value={r}>{RETURN_REASON_LABELS[r]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {reason === "OTHER" && (
        <div className="space-y-1.5">
          <Label className="text-xs">Please describe the reason</Label>
          <Textarea value={reasonOtherText} onChange={(e) => onReasonOtherTextChange(e.target.value)} rows={2} />
        </div>
      )}

      <div className="space-y-1.5">
        <Label className="text-xs">Additional Notes (optional)</Label>
        <Textarea value={notes} onChange={(e) => onNotesChange(e.target.value)} rows={2} />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Evidence Photos (optional)</Label>
        <EvidencePhotosInput urls={evidenceUrls} onChange={onEvidenceChange} endpoint={uploadEndpoint} />
      </div>
    </div>
  );
}
