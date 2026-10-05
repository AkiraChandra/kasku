/**
 * Rate limiting middleware using in-process sliding window.
 * Keyed by API key hash or IP. Thread-safe enough for single-process Hono.
 */

export type RateLimitConfig = {
  limit: number      // max requests
  windowMs: number   // window duration in ms
  keyByIp?: boolean  // if true, key by IP; otherwise caller provides key
}

const stores = new Map<string, { count: number; resetAt: number }>()

// Prune stale entries every 60s
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of stores.entries()) {
    if (entry.resetAt < now) stores.delete(key)
  }
}, 60_000)

export function checkRateLimit(
  key: string,
  config: RateLimitConfig,
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now()
  const entry = stores.get(key)

  if (!entry || entry.resetAt < now) {
    const resetAt = now + config.windowMs
    stores.set(key, { count: 1, resetAt })
    return { allowed: true, remaining: config.limit - 1, resetAt }
  }

  if (entry.count >= config.limit) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt }
  }

  entry.count++
  return { allowed: true, remaining: config.limit - entry.count, resetAt: entry.resetAt }
}

export function rateLimitHeaders(result: ReturnType<typeof checkRateLimit>): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(result.remaining + (result.allowed ? 1 : 0)),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
  }
}

// Per-key limits for ingest
export const INGEST_RATE_LIMIT: RateLimitConfig = { limit: 60, windowMs: 60_000 }
export const AUTH_RATE_LIMIT: RateLimitConfig = { limit: 5, windowMs: 60_000 }
export const API_RATE_LIMIT: RateLimitConfig = { limit: 100, windowMs: 60_000 }
