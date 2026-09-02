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

/** One row per Windows-installed printer the agent currently sees — reported in full each time so the backend can diff and flip anything missing to DISCONNECTED. */
export const agentPrinterSchema = z.object({
  systemPrinterName: z.string().trim().min(1).max(255),
  connectionType: printerConnectionTypeSchema,
});
export const agentPrinterReportSchema = z.object({
  printers: z.array(agentPrinterSchema).max(100),
});
export type AgentPrinterReportInput = z.infer<typeof agentPrinterReportSchema>;

export const agentJobFailSchema = z.object({
  errorMessage: z.string().trim().min(1).max(500),
});
export type AgentJobFailInput = z.infer<typeof agentJobFailSchema>;
