"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";

interface Props {
  businessId: string;
  currentStatus: string;
}

export function BusinessActions({ businessId, currentStatus }: Props) {
  const router = useRouter();
  const [suspendReason, setSuspendReason] = useState("");
  const [showSuspendForm, setShowSuspendForm] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);

  async function doAction(action: string, extra?: Record<string, string>) {
    setLoading(action);
    try {
      await api.patch(`/api/super-admin/businesses/${businessId}`, { action, ...extra });
      toast.success(
        action === "suspend"
          ? "Business suspended."
          : action === "activate"
          ? "Business activated."
          : "Business deleted."
      );
      setShowSuspendForm(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Action failed");
    } finally {
      setLoading(null);
    }
  }

  const isDeleted = currentStatus === "DELETED";
  const isSuspended = currentStatus === "SUSPENDED";
  const isActive = currentStatus === "ACTIVE";

  if (isDeleted) {
    return (
      <span className="text-sm text-muted-foreground rounded-lg border px-3 py-2">
        This business has been deleted.
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-2 items-end">
      <div className="flex gap-2 flex-wrap justify-end">
        {isActive && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSuspendForm((v) => !v)}
          >
            Suspend
          </Button>
        )}
        {isSuspended && (
          <Button
            variant="outline"
            size="sm"
            disabled={loading === "activate"}
            onClick={() => doAction("activate")}
          >
            {loading === "activate" ? "Activating…" : "Activate"}
          </Button>
        )}
        <Button
          variant="destructive"
          size="sm"
          disabled={loading === "delete"}
          onClick={() => {
            if (confirm("Permanently delete this business? This cannot be undone.")) {
              doAction("delete");
            }
          }}
        >
          {loading === "delete" ? "Deleting…" : "Delete"}
        </Button>
      </div>

      {showSuspendForm && (
        <div className="flex gap-2 w-full max-w-sm">
          <input
            value={suspendReason}
            onChange={(e) => setSuspendReason(e.target.value)}
            placeholder="Reason for suspension…"
            className="flex-1 rounded-lg border bg-background px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button
            size="sm"
            disabled={!suspendReason.trim() || loading === "suspend"}
            onClick={() => doAction("suspend", { reason: suspendReason.trim() })}
          >
            {loading === "suspend" ? "…" : "Confirm"}
          </Button>
        </div>
      )}
    </div>
  );
}
