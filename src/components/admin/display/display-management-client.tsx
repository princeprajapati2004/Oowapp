"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { toast } from "sonner";
import {
  ChefHat,
  Monitor,
  Soup,
  PackageCheck,
  Truck,
  Hash,
  LayoutGrid,
  Plus,
  ExternalLink,
  QrCode as QrCodeIcon,
  RotateCw,
  Trash2,
  Settings2,
  Loader2,
  MoreVertical,
  type LucideIcon,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/shared/empty-state";
import { CopyButton } from "@/components/shared/copy-button";
import { DisplaySettingsSheet } from "@/components/admin/display/display-settings-sheet";
import { api, ApiError } from "@/lib/api-client";
import type { BusinessType } from "@/lib/business-types";
import {
  DISPLAY_TYPES,
  DISPLAY_TYPE_LABELS,
  DISPLAY_TYPE_DESCRIPTIONS,
  type DisplayTypeValue,
  type DisplayPayload,
} from "@/lib/display-types";

const DISPLAY_TYPE_ICONS: Record<DisplayTypeValue, LucideIcon> = {
  KITCHEN: ChefHat,
  CUSTOMER_STATUS: Monitor,
  PREPARATION: Soup,
  READY_PICKUP: PackageCheck,
  DELIVERY_DISPATCH: Truck,
  TOKEN: Hash,
  CUSTOM: LayoutGrid,
};

function displayUrl(token: string): string {
  if (typeof window === "undefined") return `/display/${token}`;
  return `${window.location.origin}/display/${token}`;
}

function relativeTime(iso: string | null): string {
  if (!iso) return "Never connected";
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function DisplayManagementClient({
  businessType,
  initialDisplays,
}: {
  businessType: BusinessType;
  initialDisplays: DisplayPayload[];
}) {
  const [displays, setDisplays] = useState(initialDisplays);
  const [createOpen, setCreateOpen] = useState(false);
  const [qrFor, setQrFor] = useState<DisplayPayload | null>(null);
  const [settingsFor, setSettingsFor] = useState<DisplayPayload | null>(null);
  const [rotateFor, setRotateFor] = useState<DisplayPayload | null>(null);
  const [deleteFor, setDeleteFor] = useState<DisplayPayload | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  void businessType; // reserved: business-type-specific default display suggestions

  function patchLocal(id: string, patch: Partial<DisplayPayload>) {
    setDisplays((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }

  async function toggleActive(display: DisplayPayload) {
    const next = !display.isActive;
    patchLocal(display.id, { isActive: next });
    try {
      await api.patch(`/api/admin/displays/${display.id}`, { action: "update", isActive: next });
    } catch (err) {
      patchLocal(display.id, { isActive: !next });
      toast.error(err instanceof ApiError ? err.message : "Failed to update display");
    }
  }

  async function handleRotate() {
    if (!rotateFor) return;
    setBusyId(rotateFor.id);
    try {
      const updated = await api.patch<DisplayPayload>(`/api/admin/displays/${rotateFor.id}`, { action: "rotate_token" });
      setDisplays((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
      toast.success("Display link rotated — the old URL/QR code no longer works.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to rotate link");
    } finally {
      setBusyId(null);
      setRotateFor(null);
    }
  }

  async function handleDelete() {
    if (!deleteFor) return;
    setBusyId(deleteFor.id);
    try {
      await api.delete(`/api/admin/displays/${deleteFor.id}`);
      setDisplays((prev) => prev.filter((d) => d.id !== deleteFor.id));
      toast.success(`"${deleteFor.name}" deleted`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to delete display");
    } finally {
      setBusyId(null);
      setDeleteFor(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-xl font-semibold">Order Display / Display Management</h1>
          <p className="text-sm text-muted-foreground">
            Configure kitchen, customer-status and other live order displays — open on any TV, tablet or desktop.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" /> Create display
        </Button>
      </div>

      {displays.length === 0 ? (
        <EmptyState
          icon={Monitor}
          title="No displays yet"
          description="Create a Kitchen, Customer Status or other display to open on a TV, tablet or desktop."
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" /> Create display
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {displays.map((display) => {
            const Icon = DISPLAY_TYPE_ICONS[display.type];
            return (
              <div key={display.id} className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Icon className="size-4.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{display.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{DISPLAY_TYPE_LABELS[display.type]}</p>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger className={buttonVariants({ variant: "ghost", size: "icon-sm" })}>
                      <MoreVertical className="size-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setSettingsFor(display)}>
                        <Settings2 className="size-4" /> Settings
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setQrFor(display)}>
                        <QrCodeIcon className="size-4" /> QR code
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setRotateFor(display)}>
                        <RotateCw className="size-4" /> Revoke & rotate link
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setDeleteFor(display)} className="text-destructive">
                        <Trash2 className="size-4" /> Delete display
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
                  <span className="text-xs text-muted-foreground">{display.isActive ? "Active" : "Deactivated"}</span>
                  <Switch
                    checked={display.isActive}
                    onCheckedChange={() => toggleActive(display)}
                    aria-label={display.isActive ? "Deactivate display" : "Activate display"}
                  />
                </div>

                <p className="text-xs text-muted-foreground">Last connected: {relativeTime(display.lastConnectedAt)}</p>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    render={<a href={`/display/${display.token}`} target="_blank" rel="noreferrer" />}
                  >
                    <ExternalLink className="size-3.5" /> Open display
                  </Button>
                  <CopyButton value={displayUrl(display.token)} iconOnly size="sm" label="Copy display URL" successMessage="Display URL copied" />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <CreateDisplayDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(d) => setDisplays((prev) => [...prev, d])}
      />

      <QrCodeDialog display={qrFor} onOpenChange={(open) => !open && setQrFor(null)} />

      {settingsFor && (
        <DisplaySettingsSheet
          display={settingsFor}
          onOpenChange={(open) => !open && setSettingsFor(null)}
          onSaved={(updated) => {
            setDisplays((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
            setSettingsFor(null);
          }}
        />
      )}

      <AlertDialog open={!!rotateFor} onOpenChange={(open) => !open && setRotateFor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke &amp; rotate this display&apos;s link?</AlertDialogTitle>
            <AlertDialogDescription>
              The current URL and QR code for &ldquo;{rotateFor?.name}&rdquo; will stop working immediately. You&apos;ll need to re-open or re-scan the new one on every device showing this display.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRotate} disabled={busyId === rotateFor?.id}>
              {busyId === rotateFor?.id ? <Loader2 className="size-4 animate-spin" /> : "Rotate link"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteFor} onOpenChange={(open) => !open && setDeleteFor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{deleteFor?.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>This display&apos;s URL and QR code will stop working. This can&apos;t be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={busyId === deleteFor?.id} variant="destructive">
              {busyId === deleteFor?.id ? <Loader2 className="size-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CreateDisplayDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (display: DisplayPayload) => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<DisplayTypeValue>("KITCHEN");
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    if (!name.trim()) {
      toast.error("Give this display a name");
      return;
    }
    setCreating(true);
    try {
      const display = await api.post<DisplayPayload>("/api/admin/displays", { name: name.trim(), type });
      onCreated(display);
      toast.success(`"${display.name}" created`);
      onOpenChange(false);
      setName("");
      setType("KITCHEN");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to create display");
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create a display</DialogTitle>
          <DialogDescription>Pick what this screen should show, then open it on a TV, tablet or desktop.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="display-name">Display name</Label>
            <Input id="display-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kitchen TV, Counter Screen" maxLength={80} />
          </div>

          <div className="space-y-1.5">
            <Label>Display type</Label>
            <div className="grid grid-cols-1 gap-2 max-h-72 overflow-y-auto pr-1">
              {DISPLAY_TYPES.map((t) => {
                const Icon = DISPLAY_TYPE_ICONS[t];
                const selected = type === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                      selected ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-muted/40"
                    }`}
                  >
                    <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
                    <div>
                      <p className="text-sm font-medium">{DISPLAY_TYPE_LABELS[t]}</p>
                      <p className="text-xs text-muted-foreground">{DISPLAY_TYPE_DESCRIPTIONS[t]}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={creating}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={creating}>
            {creating ? <Loader2 className="size-4 animate-spin" /> : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QrCodeDialog({ display, onOpenChange }: { display: DisplayPayload | null; onOpenChange: (open: boolean) => void }) {
  const url = display ? displayUrl(display.token) : "";
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!url) {
      setDataUrl(null);
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(url, { width: 320, margin: 2 })
      .then((d) => !cancelled && setDataUrl(d))
      .catch(() => !cancelled && setDataUrl(null));
    return () => {
      cancelled = true;
    };
  }, [url]);

  return (
    <Dialog open={!!display} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{display?.name} — QR code</DialogTitle>
          <DialogDescription>Scan to open this display on a phone or tablet.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-3 py-2">
          {dataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={dataUrl} alt="Display QR code" className="size-56 rounded-lg border" />
          ) : (
            <div className="flex size-56 items-center justify-center rounded-lg border">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          )}
          <p className="break-all text-center text-xs text-muted-foreground">{url}</p>
          <CopyButton value={url} label="Copy URL" className="w-full" />
        </div>
      </DialogContent>
    </Dialog>
  );
}
