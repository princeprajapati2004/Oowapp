"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Star, Trash2, PlayCircle, Loader2, Bluetooth, Wifi, Usb, Monitor, Printer as PrinterIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { api, ApiError } from "@/lib/api-client";
import { fetchPrinters, testPrintPrinter, type PrinterProfileDTO } from "@/lib/printing/print-service";
import {
  CONNECTION_TYPE_LABELS,
  CONNECTION_STATUS_LABELS,
  CONNECTION_STATUS_BADGE_CLASS,
  PRINT_JOB_STATUS_LABELS,
  PRINT_JOB_STATUS_BADGE_CLASS,
} from "@/lib/printer-status";
import { printFormatLabel } from "@/lib/types/print";
import { AddPrinterWizard } from "./add-printer-wizard";
import { cn } from "@/lib/utils";

const CONNECTION_ICONS = { BLUETOOTH: Bluetooth, WIFI: Wifi, USB: Usb, SYSTEM: Monitor } as const;

interface PrintJobRow {
  id: string;
  documentType: "BILL" | "KITCHEN_TICKET" | "TEST";
  status: "PENDING" | "PRINTING" | "COMPLETED" | "FAILED" | "RETRYING" | "CANCELLED";
  format: string;
  errorMessage: string | null;
  createdAt: string;
  printer: { id: string; name: string; connectionType: string } | null;
}

const DOCUMENT_TYPE_LABELS: Record<PrintJobRow["documentType"], string> = {
  BILL: "Bill",
  KITCHEN_TICKET: "Kitchen ticket",
  TEST: "Test print",
};

export function PrinterSettingsPanel({ businessName, initialAutoPrint }: { businessName: string; initialAutoPrint: boolean }) {
  const [printers, setPrinters] = useState<PrinterProfileDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PrinterProfileDTO | null>(null);
  const [jobs, setJobs] = useState<PrintJobRow[]>([]);
  const [autoPrint, setAutoPrint] = useState(initialAutoPrint);

  const loadPrinters = useCallback(async () => {
    try {
      const list = await fetchPrinters();
      setPrinters(list);
    } catch {
      toast.error("Failed to load printers");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadJobs = useCallback(async () => {
    try {
      const list = await api.get<PrintJobRow[]>("/api/admin/print-jobs");
      setJobs(list.slice(0, 10));
    } catch {
      // best-effort — the queue view just stays stale until the next poll
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadPrinters();
  }, [loadPrinters]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadJobs();
    const interval = setInterval(loadJobs, 6000);
    return () => clearInterval(interval);
  }, [loadJobs]);

  async function handleSetDefault(printer: PrinterProfileDTO) {
    try {
      const updated = await api.patch<PrinterProfileDTO>(`/api/admin/printers/${printer.id}`, { isDefault: true });
      setPrinters((prev) => prev.map((p) => (p.id === updated.id ? updated : { ...p, isDefault: false })));
      toast.success(`${printer.name} set as default`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to set default");
    }
  }

  async function handleToggleActive(printer: PrinterProfileDTO) {
    try {
      const updated = await api.patch<PrinterProfileDTO>(`/api/admin/printers/${printer.id}`, { isActive: !printer.isActive });
      setPrinters((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update");
    }
  }

  async function handleTestPrint(printer: PrinterProfileDTO) {
    setTestingId(printer.id);
    try {
      const outcome = await testPrintPrinter(printer, businessName);
      if (outcome.ok) toast.success(`Test receipt sent to ${printer.name}`);
      else toast.error(outcome.error ?? "Test print failed");
    } finally {
      setTestingId(null);
      loadPrinters();
      loadJobs();
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await api.delete(`/api/admin/printers/${deleteTarget.id}`);
      setPrinters((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      toast.success("Printer removed");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to delete");
    } finally {
      setDeleteTarget(null);
    }
  }

  async function handleAutoPrintToggle(value: boolean) {
    setAutoPrint(value);
    try {
      await api.patch("/api/admin/business", { section: "autoPrint", autoPrintCompletedBill: value });
    } catch (err) {
      setAutoPrint(!value);
      toast.error(err instanceof ApiError ? err.message : "Failed to update");
    }
  }

  function handleCreated(printer: PrinterProfileDTO) {
    setPrinters((prev) => (printer.isDefault ? [...prev.map((p) => ({ ...p, isDefault: false })), printer] : [...prev, printer]));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">Connect real thermal/receipt printers over Bluetooth, Wi-Fi, or USB.</p>
        <Button size="sm" onClick={() => setWizardOpen(true)} className="gap-1.5">
          <Plus className="size-4" /> Add printer
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : printers.length === 0 ? (
        <EmptyState
          icon={PrinterIcon}
          title="No printers connected"
          description="Add a Bluetooth, Wi-Fi, or USB printer to print bills directly, or rely on the browser's print dialog by default."
          action={
            <Button onClick={() => setWizardOpen(true)} className="gap-1.5">
              <Plus className="size-4" /> Add printer
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card divide-y">
          {printers.map((printer) => {
            const Icon = CONNECTION_ICONS[printer.connectionType];
            return (
              <div key={printer.id} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors">
                <Icon className="size-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="font-medium text-sm">{printer.name}</p>
                    {printer.isDefault && (
                      <Badge variant="secondary" className="text-xs gap-1">
                        <Star className="size-3 fill-current" /> Default
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                    <Badge variant="outline" className={cn("text-xs", CONNECTION_STATUS_BADGE_CLASS[printer.status as keyof typeof CONNECTION_STATUS_BADGE_CLASS])}>
                      {CONNECTION_STATUS_LABELS[printer.status as keyof typeof CONNECTION_STATUS_LABELS] ?? printer.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {CONNECTION_TYPE_LABELS[printer.connectionType]} · {printFormatLabel(printer.paperSize)}
                      {printer.purpose ? ` · ${printer.purpose}` : ""}
                    </span>
                  </div>
                  {printer.statusMessage && printer.status === "ERROR" && (
                    <p className="text-xs text-destructive mt-0.5">{printer.statusMessage}</p>
                  )}
                </div>

                {!printer.isDefault && (
                  <Button variant="ghost" size="sm" onClick={() => handleSetDefault(printer)} className="text-xs">
                    Set default
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handleTestPrint(printer)}
                  disabled={testingId === printer.id}
                  aria-label="Test print"
                  className="text-muted-foreground hover:text-foreground"
                >
                  {testingId === printer.id ? <Loader2 className="size-3.5 animate-spin" /> : <PlayCircle className="size-3.5" />}
                </Button>
                <Switch checked={printer.isActive} onCheckedChange={() => handleToggleActive(printer)} aria-label="Enable/disable printer" />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setDeleteTarget(printer)}
                  aria-label="Delete"
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between rounded-xl border bg-card px-4 py-3">
        <div>
          <p className="text-sm font-medium select-none">Auto-print bill when order is completed</p>
          <p className="text-xs text-muted-foreground">Sends the bill to the default printer automatically — no manual click needed.</p>
        </div>
        <Switch checked={autoPrint} onCheckedChange={handleAutoPrintToggle} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Print queue</CardTitle>
          <CardDescription>The last 10 print attempts across all printers.</CardDescription>
        </CardHeader>
        <CardContent>
          {jobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No print jobs yet.</p>
          ) : (
            <div className="space-y-2">
              {jobs.map((job) => (
                <div key={job.id} className="flex items-center gap-3 text-sm">
                  <Badge variant="outline" className={cn("text-xs shrink-0", PRINT_JOB_STATUS_BADGE_CLASS[job.status])}>
                    {PRINT_JOB_STATUS_LABELS[job.status]}
                  </Badge>
                  <span className="flex-1 min-w-0 truncate text-muted-foreground">
                    {DOCUMENT_TYPE_LABELS[job.documentType]} · {job.printer?.name ?? "System dialog"}
                    {job.status === "FAILED" && job.errorMessage ? ` — ${job.errorMessage}` : ""}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {new Date(job.createdAt).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AddPrinterWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        businessName={businessName}
        hasExistingPrinters={printers.length > 0}
        onCreated={handleCreated}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete printer?"
        description={`"${deleteTarget?.name}" will be removed. This won't affect past print jobs.`}
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
      />
    </div>
  );
}
