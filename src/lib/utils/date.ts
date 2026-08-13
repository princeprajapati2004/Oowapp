const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_536_000],
  ["month", 2_592_000],
  ["week", 604_800],
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
  ["second", 1],
];

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function formatDistanceToNow(date: Date): string {
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  for (const [unit, threshold] of UNITS) {
    if (Math.abs(seconds) >= threshold || unit === "second") {
      return rtf.format(Math.round(seconds / threshold), unit);
    }
  }
  return "just now";
}

export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(typeof date === "string" ? new Date(date) : date);
}

// Restaurants using this app operate in India — order timestamps are always
// shown in IST regardless of the viewing device's local timezone, so a
// browser in a different timezone (or a server render) never disagrees with
// what the till clock says.
const ORDER_TIME_ZONE = "Asia/Kolkata";

// Single source of truth for "Aug 12, 2026" + "Wednesday • 09:21 AM" used by
// both the order history card and the order detail page — kept as one
// function so the two views can never render different dates for the same
// order.
export function formatOrderDateParts(date: Date | string): { date: string; dayTime: string } {
  const d = typeof date === "string" ? new Date(date) : date;
  const dateLabel = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: ORDER_TIME_ZONE,
  });
  const weekday = d.toLocaleDateString("en-US", { weekday: "long", timeZone: ORDER_TIME_ZONE });
  const time = d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: ORDER_TIME_ZONE,
  });
  return { date: dateLabel, dayTime: `${weekday} • ${time}` };
}
