import { z } from "zod";
import { printerConnectionTypeSchema } from "@/lib/validation/printer";

export const agentRegisterSchema = z.object({
  pairingCode: z.string().trim().min(1).max(20),
  computerName: z.string().trim().min(1).max(120),
  version: z.string().trim().max(40).nullable().optional(),
});
export type AgentRegisterInput = z.infer<typeof agentRegisterSchema>;

export const agentHeartbeatSchema = z.object({
  version: z.string().trim().max(40).nullable().optional(),
});
export type AgentHeartbeatInput = z.infer<typeof agentHeartbeatSchema>;

/**
 * One row per Windows-installed printer the agent currently sees —
 * reported in full each time so the backend can diff and flip anything
 * missing to DISCONNECTED. `label` is an optional friendlier display name
 * used only when first creating the PrinterProfile (e.g. "SR588 (Bluetooth
 * SPP)" for a queue-less Bluetooth device whose systemPrinterName is just
 * a bare COM port like "COM5") — it never overwrites an owner-renamed
 * printer on later reports.
 */
export const agentPrinterSchema = z.object({
  systemPrinterName: z.string().trim().min(1).max(255),
  connectionType: printerConnectionTypeSchema,
  label: z.string().trim().min(1).max(255).nullable().optional(),
  // Whether the agent actually verified this target responds right now
  // (e.g. a Bluetooth SPP port was opened successfully), as opposed to
  // merely appearing in Windows' device list. Omitted (undefined) means
  // "not actively probed" — e.g. a Windows printer queue, where presence
  // in Get-Printer is treated as sufficient, same as before this field
  // existed — and is NOT the same as `false`.
  reachable: z.boolean().optional(),
});
export const agentPrinterReportSchema = z.object({
  printers: z.array(agentPrinterSchema).max(100),
});
export type AgentPrinterReportInput = z.infer<typeof agentPrinterReportSchema>;

export const agentJobFailSchema = z.object({
  errorMessage: z.string().trim().min(1).max(500),
});
export type AgentJobFailInput = z.infer<typeof agentJobFailSchema>;
