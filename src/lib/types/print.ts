import type { PrintFormat } from "@/generated/prisma/client";

export type { PrintFormat };

export const PRINT_FORMATS: { value: PrintFormat; label: string; group: string }[] = [
  { value: "THERMAL_58", label: "2 Inch Thermal", group: "Thermal" },
  { value: "THERMAL_80", label: "3 Inch Thermal", group: "Thermal" },
  { value: "A4_STYLE_1", label: "A4 — Style 1 · Professional Invoice", group: "A4" },
  { value: "A4_STYLE_2", label: "A4 — Style 2 · Modern Restaurant Bill", group: "A4" },
  { value: "A4_STYLE_3", label: "A4 — Style 3 · Detailed Tax Invoice", group: "A4" },
  { value: "A4_STYLE_4", label: "A4 — Style 4 · Simple Receipt", group: "A4" },
  { value: "A3", label: "A3 · Large Format", group: "Large format" },
];

export function printFormatLabel(format: PrintFormat): string {
  return PRINT_FORMATS.find((f) => f.value === format)?.label ?? format;
}

// One @page rule per format — injected by BillDocument right before print.
// Thermal receipts use `auto` height so they never force a fixed page length
// (no blank tail on short receipts); A4/A3 use their real physical sizes.
export function printFormatPageCss(format: PrintFormat): string {
  switch (format) {
    case "THERMAL_58":
      return "@page { size: 58mm auto; margin: 0; }";
    case "THERMAL_80":
      return "@page { size: 80mm auto; margin: 0; }";
    case "A3":
      return "@page { size: A3; margin: 12mm; }";
    default:
      return "@page { size: A4; margin: 10mm; }";
  }
}
