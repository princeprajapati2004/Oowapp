// Shared date-range handling for the Reports Center. Distinct from the
// inline getDateRange() in src/app/api/admin/analytics/route.ts (left
// untouched — no regression risk to the working dashboard): that one is
// granularity-aware for chart bucketing and doesn't support This Week/This
// Year, which the report spec explicitly calls for.

export type ReportDatePreset =
  | "today"
  | "yesterday"
  | "this_week"
  | "this_month"
  | "last_month"
  | "this_year"
  | "custom";

export const REPORT_DATE_PRESETS: { value: ReportDatePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this_week", label: "This Week" },
  { value: "this_month", label: "This Month" },
  { value: "last_month", label: "Last Month" },
  { value: "this_year", label: "This Year" },
  { value: "custom", label: "Custom Date" },
];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Local calendar "YYYY-MM-DD" for a Date, read off its own get*() component
 * accessors — never round-trips through toISOString(), which silently
 * shifts the date backward for any timezone ahead of UTC (local midnight in
 * IST serializes to 18:30 UTC the previous day).
 */
export function toDateInputValue(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Client-side convenience: fills the two date inputs when a preset button is
 * clicked, using the browser's own local calendar (the shop owner's clock).
 * Mirrors the Monday-start "This Week" convention already used by
 * order-filters-bar.tsx's presetRange(), extended with This Year (which that
 * picker doesn't have) since the report spec calls for it.
 */
export function presetToDateStrings(preset: Exclude<ReportDatePreset, "custom">): { from: string; to: string } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (preset) {
    case "today":
      return { from: toDateInputValue(today), to: toDateInputValue(today) };
    case "yesterday": {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      return { from: toDateInputValue(y), to: toDateInputValue(y) };
    }
    case "this_week": {
      const from = new Date(today);
      from.setDate(from.getDate() - ((from.getDay() + 6) % 7)); // Monday start
      return { from: toDateInputValue(from), to: toDateInputValue(today) };
    }
    case "this_month": {
      const from = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: toDateInputValue(from), to: toDateInputValue(today) };
    }
    case "last_month": {
      const from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const to = new Date(today.getFullYear(), today.getMonth(), 0);
      return { from: toDateInputValue(from), to: toDateInputValue(to) };
    }
    case "this_year": {
      const from = new Date(today.getFullYear(), 0, 1);
      return { from: toDateInputValue(from), to: toDateInputValue(today) };
    }
  }
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/**
 * Midnight (or 23:59:59.999) IST for a "YYYY-MM-DD" calendar date, computed
 * as an absolute UTC instant via Date.UTC rather than the server process's
 * own local timezone — so a report's day boundary is always real IST
 * regardless of where the Next.js server happens to run (a cloud host's
 * process timezone is commonly UTC, which would otherwise shift every
 * "Today"/date-range boundary by 5.5 hours and silently move early-morning
 * IST orders into the wrong day). Oowapp is an India-only, INR-only,
 * GST-aware product (Shop.timezone defaults to "Asia/Kolkata"), so
 * hardcoding the offset here is a deliberate, scoped simplification for
 * Reports Center — not a general timezone system.
 */
function istDayStart(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0) - IST_OFFSET_MS);
}
function istDayEnd(dateStr: string): Date {
  return new Date(istDayStart(dateStr).getTime() + 24 * 60 * 60 * 1000 - 1);
}

const RANGE_LABEL_FORMAT = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

export interface ResolvedDateRange {
  from: Date;
  to: Date;
  label: string;
}

/**
 * Server-side: turns the "YYYY-MM-DD" from/to strings a report request
 * carries (however they were chosen — a preset button or the custom picker)
 * into the actual IST day-boundary Date instants every report query filters
 * on, plus a "01 Aug 2026 - 27 Aug 2026" label for PDF/Excel headers and the
 * on-screen report title.
 */
export function resolveDateRange(fromStr: string, toStr: string): ResolvedDateRange {
  const from = istDayStart(fromStr);
  const to = istDayEnd(toStr);
  const label =
    fromStr === toStr ? RANGE_LABEL_FORMAT.format(from) : `${RANGE_LABEL_FORMAT.format(from)} - ${RANGE_LABEL_FORMAT.format(to)}`;
  return { from, to, label };
}
