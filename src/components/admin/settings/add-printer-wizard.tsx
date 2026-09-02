"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Bluetooth, Wifi, Usb, Monitor, Laptop, Loader2, CheckCircle2, ArrowLeft } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { FormRow } from "@/components/shared/form-row";
import { cn } from "@/lib/utils";
import { api, ApiError } from "@/lib/api-client";
import { getPrinterCapabilities, DEFAULT_BRIDGE_URL } from "@/lib/printing/capability";
import { connectNewPrinter, sendTestReceipt, type PrinterProfileDTO } from "@/lib/printing/print-service";
import { PrinterAdapterError } from "@/lib/printing/adapters/types";
import { setBridgeCredentials } from "@/lib/printing/bridge-token-store";
import { fetchPrintAgents, generateAgentPairingCode, type PrintAgentDTO } from "@/lib/printing/agent-client";
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

type Step = "type" | "connect" | "agent-pair" | "agent-pick" | "details";
type ConnectOption = "AGENT" | PrinterConnectionType;

const CONNECTION_OPTIONS: { type: ConnectOption; icon: typeof Bluetooth; description: string; recommended?: boolean }[] = [
  {
    type: "AGENT",
    icon: Laptop,
    description: "Recommended for USB, Classic Bluetooth (paired in Windows), and network printers.",
    recommended: true,
  },
  { type: "WIFI", icon: Wifi, description: "Network printer, connected via the Local Print Bridge." },
  { type: "BLUETOOTH", icon: Bluetooth, description: "Pair directly over Bluetooth — only works for BLE printers your browser supports." },
  { type: "USB", icon: Usb, description: "Wired printer plugged into this computer, authorized directly in this browser tab." },
  { type: "SYSTEM", icon: Monitor, description: "Use the browser's print dialog and your OS printer driver." },
];

const PAIRING_POLL_MS = 3000;

export function AddPrinterWizard({ open, onOpenChange, businessName, hasExistingPrinters, onCreated }: WizardProps) {
  const [step, setStep] = useState<Step>("type");
  const [connectionType, setConnectionType] = useState<PrinterConnectionType | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [connectErrorCode, setConnectErrorCode] = useState<string | null>(null);
  const [identity, setIdentity] = useState<Record<string, string | number>>({});
  const [deviceLabel, setDeviceLabel] = useState<string>("");

  const [wifiIp, setWifiIp] = useState("");
  const [wifiPort, setWifiPort] = useState("9100");
  const [wifiToken, setWifiToken] = useState("");

  const [agents, setAgents] = useState<PrintAgentDTO[]>([]);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [pairingLoading, setPairingLoading] = useState(false);
  const [selectedAgentPrinterId, setSelectedAgentPrinterId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [name, setName] = useState("");
  const [paperSize, setPaperSize] = useState<PrintFormat>("THERMAL_58");
  const [purpose, setPurpose] = useState("");
  const [isDefault, setIsDefault] = useState(!hasExistingPrinters);
  const [saving, setSaving] = useState(false);

  const caps = getPrinterCapabilities();
  const onlineAgentPrinters = agents.filter((a) => a.online).flatMap((a) => a.printers.map((p) => ({ ...p, agentName: a.name })));

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  useEffect(() => stopPolling, []);

  function reset() {
    stopPolling();
    setStep("type");
    setConnectionType(null);
    setConnecting(false);
    setConnectError(null);
    setConnectErrorCode(null);
    setIdentity({});
    setDeviceLabel("");
    setWifiIp("");
    setWifiPort("9100");
    setWifiToken("");
    setAgents([]);
    setPairingCode(null);
    setPairingLoading(false);
    setSelectedAgentPrinterId(null);
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

  async function refreshAgents() {
    try {
      const list = await fetchPrintAgents();
      setAgents(list);
      return list;
    } catch {
      return agents;
    }
  }

  async function enterAgentFlow() {
    setConnectionType(null);
    setConnectError(null);
    setStep("agent-pair");
    const list = await refreshAgents();
    if (list.some((a) => a.online && a.printers.length > 0)) {
      setStep("agent-pick");
      return;
    }
    stopPolling();
    pollRef.current = setInterval(async () => {
      const polled = await refreshAgents();
      if (polled.some((a) => a.online && a.printers.length > 0)) {
        stopPolling();
        setStep("agent-pick");
      }
    }, PAIRING_POLL_MS);
  }

  async function handleGeneratePairingCode() {
    setPairingLoading(true);
    try {
      const { code } = await generateAgentPairingCode();
      setPairingCode(code);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to generate pairing code");
    } finally {
      setPairingLoading(false);
    }
  }

  function selectAgentPrinter(printer: PrinterProfileDTO) {
    setSelectedAgentPrinterId(printer.id);
    setConnectionType(printer.connectionType);
    setDeviceLabel(printer.name);
    setName(printer.name);
    setPaperSize(printer.paperSize);
    setStep("details");
  }

  function selectType(type: ConnectOption) {
    setConnectError(null);
    setConnectErrorCode(null);
    if (type === "AGENT") {
      enterAgentFlow();
      return;
    }
    setConnectionType(type);
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
    setConnectErrorCode(null);
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
      setConnectErrorCode(err instanceof PrinterAdapterError ? err.code : null);
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
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      if (selectedAgentPrinterId) {
        const updated = await api.patch<PrinterProfileDTO>(`/api/admin/printers/${selectedAgentPrinterId}`, {
          name: name.trim(),
          paperSize,
          purpose: purpose.trim() || null,
          isDefault,
          isActive: true,
        });
        toast.success("Printer added");
        onCreated(updated);
        handleClose(false);
        return;
      }

      if (!connectionType) return;
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
            {CONNECTION_OPTIONS.map(({ type, icon: Icon, description, recommended }) => {
              const disabled =
                (type === "BLUETOOTH" && !caps.bluetooth.usable) || (type === "USB" && !caps.usb.usable);
              const reason = type === "BLUETOOTH" ? caps.bluetooth.reason : type === "USB" ? caps.usb.reason : null;
              const label = type === "AGENT" ? "Local Print Agent" : CONNECTION_TYPE_LABELS[type];
              return (
                <button
                  key={type}
                  type="button"
                  disabled={disabled}
                  onClick={() => selectType(type)}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                    disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-muted/40",
                    recommended && !disabled && "border-primary/40 bg-primary/[0.03]"
                  )}
                >
                  <Icon className="size-5 shrink-0 mt-0.5 text-muted-foreground" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="font-medium">{label}</p>
                      {recommended && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          Recommended
                        </Badge>
                      )}
                    </div>
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
            {connectError && (
              <div className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5">
                <p className="text-sm text-destructive">{connectError}</p>
                {connectErrorCode === "NO_COMPATIBLE_SERVICE" && (
                  <Button type="button" variant="outline" size="sm" onClick={() => selectType("AGENT")} className="w-full">
                    Use Local Print Agent instead
                  </Button>
                )}
              </div>
            )}
            <Button onClick={handleConnectBluetoothOrUsb} disabled={connecting} className="w-full gap-1.5">
              {connecting && <Loader2 className="size-4 animate-spin" />}
              {connecting ? "Connecting…" : `Connect ${CONNECTION_TYPE_LABELS[connectionType]} device`}
            </Button>
          </div>
        )}

        {step === "agent-pair" && (
          <div className="space-y-4">
            {agents.length > 0 && !agents.some((a) => a.online) && (
              <p className="text-sm text-muted-foreground">
                A Local Print Agent is registered but currently offline. Start it on the owner&apos;s PC, or generate a new pairing
                code below to set up another one.
              </p>
            )}
            {!pairingCode ? (
              <>
                <p className="text-sm text-muted-foreground">
                  The Local Print Agent runs on your Windows PC and prints to whatever printers Windows already has installed —
                  USB, Classic Bluetooth (paired in Windows Settings), or network printers.
                </p>
                <Button onClick={handleGeneratePairingCode} disabled={pairingLoading} className="w-full gap-1.5">
                  {pairingLoading && <Loader2 className="size-4 animate-spin" />}
                  Generate pairing code
                </Button>
              </>
            ) : (
              <>
                <div className="rounded-xl border bg-muted/30 px-4 py-4 text-center">
                  <p className="text-2xl font-mono font-semibold tracking-[0.3em]">{pairingCode}</p>
                  <p className="text-xs text-muted-foreground mt-1">Expires in 10 minutes</p>
                </div>
                <div className="space-y-1 text-sm text-muted-foreground">
                  <p>On the PC with your printer(s):</p>
                  <ol className="list-decimal list-inside space-y-0.5">
                    <li>
                      Run <code className="rounded bg-muted px-1 py-0.5 text-xs">npm run print-agent</code>
                    </li>
                    <li>Enter this pairing code when prompted</li>
                  </ol>
                </div>
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-2">
                  <Loader2 className="size-4 animate-spin" /> Waiting for agent to connect…
                </div>
              </>
            )}
            <Button variant="ghost" size="sm" onClick={() => setStep("type")} className="gap-1.5">
              <ArrowLeft className="size-3.5" /> Back
            </Button>
          </div>
        )}

        {step === "agent-pick" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Select a printer discovered by your Local Print Agent.</p>
            {onlineAgentPrinters.length === 0 ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  No printers discovered yet. Make sure a printer is installed on that PC (Windows Settings → Printers), then
                  refresh.
                </p>
                <Button variant="outline" size="sm" onClick={refreshAgents} className="w-full">
                  Refresh
                </Button>
              </div>
            ) : (
              <div className="space-y-1.5">
                {onlineAgentPrinters.map((printer) => (
                  <button
                    key={printer.id}
                    type="button"
                    onClick={() => selectAgentPrinter(printer)}
                    className="flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left text-sm hover:bg-muted/40 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="font-medium truncate">{printer.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {CONNECTION_TYPE_LABELS[printer.connectionType]} · {printer.agentName}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-xs shrink-0",
                        printer.status === "CONNECTED"
                          ? "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400"
                          : "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900/30 dark:text-slate-400"
                      )}
                    >
                      {printer.status === "CONNECTED" ? "Online" : "Offline"}
                    </Badge>
                  </button>
                ))}
              </div>
            )}
            <Button variant="ghost" size="sm" onClick={() => setStep("type")} className="gap-1.5">
              <ArrowLeft className="size-3.5" /> Back
            </Button>
          </div>
        )}

        {step === "details" && (
          <div className="space-y-4">
            {deviceLabel && (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-400">
                <CheckCircle2 className="size-4 shrink-0" />
                <span>
                  {selectedAgentPrinterId ? `Using ${deviceLabel} via Local Print Agent` : `Connected to ${deviceLabel} — test receipt sent`}
                </span>
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
