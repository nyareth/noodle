import { ApiError } from "./errors";

const hits = new Map<string, { count: number; reset: number }>();

/** Tiny in-memory fixed-window limiter (fine for one server process / ~50 students). */
export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  if (hits.size > 5000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  const h = hits.get(key);
  if (!h || h.reset < now) { hits.set(key, { count: 1, reset: now + windowMs }); return; }
  if (++h.count > limit) {
    throw new ApiError(429, "rate_limited", "Too many attempts. Please wait a few minutes and try again.", {
      retry_after_seconds: Math.ceil((h.reset - now) / 1000),
    });
  }
}
