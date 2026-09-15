const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * Validates a user-supplied URL (e.g. a manually-entered courier tracking
 * link) allows only http/https — rejects `javascript:`, `data:`, `file:`,
 * and any other scheme that would be unsafe to render as a clickable link.
 * Returns the trimmed URL if safe, or null.
 */
export function toSafeHttpUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (!ALLOWED_PROTOCOLS.has(url.protocol)) return null;
    return trimmed;
  } catch {
    return null;
  }
}
