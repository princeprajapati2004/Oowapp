"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

interface FeaturePermissionRow {
  featureId: string;
  key: string;
  label: string;
  description: string | null;
  category: string | null;
  enabled: boolean;
  hasOverride: boolean;
  overrideEnabled: boolean | null;
  overrideReason: string | null;
}

export function FeaturePermissionsPanel({
  shopId,
  permissions,
}: {
  shopId: string;
  permissions: FeaturePermissionRow[];
}) {
  const router = useRouter();

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Feature Permissions</CardTitle>
        <CardDescription>
          Toggling here creates a per-business override that beats the plan default.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y">
          {permissions.map((permission) => (
            <FeatureRow
              key={permission.featureId}
              shopId={shopId}
              permission={permission}
              onChanged={() => router.refresh()}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function FeatureRow({
  shopId,
  permission,
  onChanged,
}: {
  shopId: string;
  permission: FeaturePermissionRow;
  onChanged: () => void;
}) {
  const [reasonOpen, setReasonOpen] = useState(false);
  const [reason, setReason] = useState(permission.overrideReason ?? "");
  const [pendingEnabled, setPendingEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  async function commit(enabled: boolean) {
    setSaving(true);
    try {
      await api.patch(`/api/super-admin/businesses/${shopId}/feature-permissions`, {
        featureId: permission.featureId,
        enabled,
        reason: reason.trim() || undefined,
      });
      toast.success(`${permission.label} ${enabled ? "enabled" : "disabled"} for this business.`);
      setReasonOpen(false);
      setPendingEnabled(null);
      onChanged();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to update permission");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">{permission.label}</p>
            {permission.hasOverride && (
              <Badge variant="outline" className="text-[10px]">
                Override
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{permission.key}</p>
          {permission.description && (
            <p className="text-xs text-muted-foreground mt-0.5">{permission.description}</p>
          )}
        </div>
        <Switch
          checked={permission.enabled}
          disabled={saving}
          onCheckedChange={(checked) => {
            setPendingEnabled(checked);
            setReasonOpen(true);
          }}
        />
      </div>

      {reasonOpen && pendingEnabled !== null && (
        <div className="mt-2 flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <p className="text-xs text-muted-foreground mb-1">
              Reason for {pendingEnabled ? "enabling" : "disabling"} (optional)
            </p>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="min-h-9"
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" disabled={saving} onClick={() => commit(pendingEnabled)}>
              Confirm
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={saving}
              onClick={() => {
                setReasonOpen(false);
                setPendingEnabled(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
