// Simple in-memory sliding-window rate limiter.
// In serverless (Vercel), each function instance has its own memory, so the window is
// per-instance rather than globally shared. For global enforcement at scale, replace this
// with a Redis/Upstash-backed implementation or Vercel's built-in rate limiting.

interface Window {
  count: number;
  resetAt: number;
}

const store = new Map<string, Window>();

/**
 * Returns true if the request is allowed, false if it exceeds the limit.
 * @param key    Unique identifier (e.g. `orders:${ip}`)
 * @param limit  Max requests allowed within windowMs
 * @param windowMs  Rolling window in milliseconds
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= limit) {
    return false;
  }

  entry.count++;
  return true;
}
