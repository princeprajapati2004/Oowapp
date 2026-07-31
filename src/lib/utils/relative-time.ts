// Pure by design (takes `nowMs` rather than reading Date.now() internally) —
// callers in a render path must capture `now` once via a mount effect first
// (React's purity rules disallow reading Date.now() during render itself).
export function formatRelativeTime(iso: string, nowMs: number): string {
  const diffSec = Math.floor((nowMs - new Date(iso).getTime()) / 1000);
  if (diffSec < 10) return "Just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === new Date(nowMs).getFullYear() ? undefined : "numeric",
  });
}
