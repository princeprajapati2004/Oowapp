// Thin client for the owner-facing Local Print Agent endpoints
// (src/app/api/admin/print-agent/**) — pairing code generation and agent/
// printer status for Printer Settings and the Add Printer wizard.
import { api } from "@/lib/api-client";
import type { PrinterProfileDTO } from "@/lib/printing/print-service";

export interface PrintAgentDTO {
  id: string;
  name: string;
  computerName: string;
  status: "ONLINE" | "OFFLINE";
  online: boolean;
  lastSeenAt: string | null;
  version: string | null;
  createdAt: string;
  printers: PrinterProfileDTO[];
}

export function fetchPrintAgents(): Promise<PrintAgentDTO[]> {
  return api.get<PrintAgentDTO[]>("/api/admin/print-agent");
}

export function generateAgentPairingCode(): Promise<{ code: string; expiresAt: string }> {
  return api.post<{ code: string; expiresAt: string }>("/api/admin/print-agent/pairing-code");
}
