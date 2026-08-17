"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Bluetooth, Wifi, Usb, Monitor, Loader2, CheckCircle2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { FormRow } from "@/components/shared/form-row";
import { cn } from "@/lib/utils";
import { api, ApiError } from "@/lib/api-client";
import { getPrinterCapabilities, DEFAULT_BRIDGE_URL } from "@/lib/printing/capability";
import { connectNewPrinter, sendTestReceipt, type PrinterProfileDTO } from "@/lib/printing/print-service";
import { setBridgeCredentials } from "@/lib/printing/bridge-token-store";
import { PRINT_FORMATS, type PrintFormat } from "@/lib/types/print";
import { CONNECTION_TYPE_LABELS } from "@/lib/printer-status";
import type { PrinterConnectionType } from "@/generated/prisma/enums";

interface WizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  businessName: string;
  hasExistingPrinters: boolean;
  onCreated: (printer: PrinterProfileDTO) => void;
}

type Step = "type" | "connect" | "details";

const CONNECTION_OPTIONS: { type: PrinterConnectionType; icon: typeof Bluetooth; description: string }[] = [
  { type: "BLUETOOTH", icon: Bluetooth, description: "Pair directly over Bluetooth (BLE thermal printers)." },
  { type: "WIFI", icon: Wifi, description: "Network printer, connected via the Local Print Bridge." },
  { type: "USB", icon: Usb, description: "Wired printer plugged into this computer." },
  { type: "SYSTEM", icon: Monitor, description: "Use the browser's print dialog and your OS printer driver." },
];

export function AddPrinterWizard({ open, onOpenChange, businessName, hasExistingPrinters, onCreated }: WizardProps) {
  const [step, setStep] = useState<Step>("type");
  const [connectionType, setConnectionType] = useState<PrinterConnectionType | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [identity, setIdentity] = useState<Record<string, string | number>>({});
  const [deviceLabel, setDeviceLabel] = useState<string>("");

  const [wifiIp, setWifiIp] = useState("");
  const [wifiPort, setWifiPort] = useState("9100");
  const [wifiToken, setWifiToken] = useState("");

  const [name, setName] = useState("");
  const [paperSize, setPaperSize] = useState<PrintFormat>("THERMAL_58");
  const [purpose, setPurpose] = useState("");
  const [isDefault, setIsDefault] = useState(!hasExistingPrinters);
  const [saving, setSaving] = useState(false);

  const caps = getPrinterCapabilities();

  function reset() {
    setStep("type");
    setConnectionType(null);
    setConnecting(false);
    setConnectError(null);
    setIdentity({});
    setDeviceLabel("");
    setWifiIp("");
    setWifiPort("9100");
    setWifiToken("");
    setName("");
    setPaperSize("THERMAL_58");
    setPurpose("");
    setIsDefault(!hasExistingPrinters);
    setSaving(false);
  }

  function handleClose(nextOpen: boolean) {
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  }

  function selectType(type: PrinterConnectionType) {
    setConnectionType(type);
    setConnectError(null);
    if (type === "SYSTEM") {
      setName("System / OS printer");
      setStep("details");
    } else {
      setStep("connect");
    }
  }

  async function handleConnectBluetoothOrUsb() {
    if (connectionType !== "BLUETOOTH" && connectionType !== "USB") return;
    setConnecting(true);
    setConnectError(null);
    try {
      const { handle, identity: resolvedIdentity } = await connectNewPrinter(connectionType);
      await sendTestReceipt(handle, {
        businessName,
        printerName: handle.label,
        connectionLabel: CONNECTION_TYPE_LABELS[connectionType],
        paperSize,
      });
      await handle.disconnect();
      setIdentity(resolvedIdentity);
      setDeviceLabel(handle.label);
      setName(handle.label);
      toast.success("Test receipt sent — check your printer");
      setStep("details");
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setConnecting(false);
    }
  }

  async function handleConnectWifi() {
    if (!wifiIp.trim() || !wifiToken.trim()) {
      setConnectError("IP address and bridge token are required");
      return;
    }
    const port = Number(wifiPort) || 9100;
    setConnecting(true);
    setConnectError(null);
    try {
      const { handle, identity: resolvedIdentity } = await connectNewPrinter("WIFI", {
        ip: wifiIp.trim(),
        port,
        token: wifiToken.trim(),
      });
      await sendTestReceipt(handle, {
        businessName,
        printerName: `${wifiIp}:${port}`,
        connectionLabel: "Wi-Fi",
        paperSize,
      });
      await handle.disconnect();
      setIdentity(resolvedIdentity);
      setDeviceLabel(`${wifiIp}:${port}`);
      setName(`Printer ${wifiIp}`);
      toast.success("Test receipt sent — check your printer");
      setStep("details");
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setConnecting(false);
    }
  }

  async function handleSave() {
    if (!connectionType) return;
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        connectionType,
        paperSize,
        purpose: purpose.trim() || null,
        isDefault,
        isActive: true,
        ...identity,
      };
      const created = await api.post<PrinterProfileDTO>("/api/admin/printers", payload);
      if (connectionType === "WIFI") {
        setBridgeCredentials(created.id, { token: wifiToken.trim(), bridgeUrl: DEFAULT_BRIDGE_URL });
      }
      toast.success("Printer added");
      onCreated(created);
      handleClose(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save printer");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add printer</DialogTitle>
        </DialogHeader>

        {step === "type" && (
          <div className="space-y-2">
            {CONNECTION_OPTIONS.map(({ type, icon: Icon, description }) => {
              const disabled = (type === "BLUETOOTH" && !caps.bluetooth.usable) || (type === "USB" && !caps.usb.usable);
              const reason = type === "BLUETOOTH" ? caps.bluetooth.reason : type === "USB" ? caps.usb.reason : null;
              return (
                <button
                  key={type}
                  type="button"
                  disabled={disabled}
                  onClick={() => selectType(type)}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                    disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-muted/40"
                  )}
                >
                  <Icon className="size-5 shrink-0 mt-0.5 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="font-medium">{CONNECTION_TYPE_LABELS[type]}</p>
                    <p className="text-xs text-muted-foreground">{disabled && reason ? reason : description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {step === "connect" && connectionType === "WIFI" && (
          <div className="space-y-4">
            <FormRow label="IP address" htmlFor="wifi-ip" required>
              <Input id="wifi-ip" value={wifiIp} onChange={(e) => setWifiIp(e.target.value)} placeholder="192.168.1.50" autoFocus />
            </FormRow>
            <FormRow label="Port" htmlFor="wifi-port" description="9100 is the standard raw ESC/POS port most network printers use.">
              <Input id="wifi-port" value={wifiPort} onChange={(e) => setWifiPort(e.target.value)} inputMode="numeric" />
            </FormRow>
            <FormRow
              label="Local Print Bridge token"
              htmlFor="wifi-token"
              required
              description='Run "npm run bridge" on this computer and paste the token it prints.'
            >
              <Input id="wifi-token" value={wifiToken} onChange={(e) => setWifiToken(e.target.value)} placeholder="Paste bridge token" />
            </FormRow>
            {connectError && <p className="text-sm text-destructive">{connectError}</p>}
            <Button onClick={handleConnectWifi} disabled={connecting} className="w-full gap-1.5">
              {connecting && <Loader2 className="size-4 animate-spin" />}
              {connecting ? "Connecting…" : "Test connection"}
            </Button>
          </div>
        )}

        {step === "connect" && (connectionType === "BLUETOOTH" || connectionType === "USB") && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Your browser will show a device picker — select your printer from the list. A small test receipt will be sent once
              connected.
            </p>
            {connectError && <p className="text-sm text-destructive">{connectError}</p>}
            <Button onClick={handleConnectBluetoothOrUsb} disabled={connecting} className="w-full gap-1.5">
              {connecting && <Loader2 className="size-4 animate-spin" />}
              {connecting ? "Connecting…" : `Connect ${CONNECTION_TYPE_LABELS[connectionType]} device`}
            </Button>
          </div>
        )}

        {step === "details" && (
          <div className="space-y-4">
            {deviceLabel && (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-400">
                <CheckCircle2 className="size-4 shrink-0" />
                <span>Connected to {deviceLabel} — test receipt sent</span>
              </div>
            )}
            <FormRow label="Printer name" htmlFor="printer-name" required>
              <Input id="printer-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus={!deviceLabel} />
            </FormRow>
            <FormRow
              label="Paper size"
              htmlFor="printer-paper"
              description={connectionType !== "SYSTEM" ? "Bluetooth/Wi-Fi/USB printers here are ESC/POS thermal printers." : undefined}
            >
              <Select value={paperSize} onValueChange={(v) => v && setPaperSize(v as PrintFormat)}>
                <SelectTrigger id="printer-paper" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(connectionType === "SYSTEM" ? PRINT_FORMATS : PRINT_FORMATS.filter((f) => f.group === "Thermal")).map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormRow>
            <FormRow
              label="Purpose"
              htmlFor="printer-purpose"
              description="Optional — helps you tell printers apart, e.g. Kitchen vs Counter."
            >
              <Input id="printer-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="e.g. Kitchen" />
            </FormRow>
            <div className="flex items-center justify-between rounded-xl border bg-card px-4 py-3">
              <p className="text-sm font-medium select-none">Set as default printer</p>
              <Switch checked={isDefault} onCheckedChange={setIsDefault} />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>
            Cancel
          </Button>
          {step === "details" && (
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save printer"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
