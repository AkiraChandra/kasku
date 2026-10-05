/**
 * Rate limiting middleware using in-process sliding window.
 * Keyed by API key hash or IP. Thread-safe enough for single-process Hono.
 */
const stores = new Map();
// Prune stale entries every 60s
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of stores.entries()) {
        if (entry.resetAt < now)
            stores.delete(key);
    }
}, 60_000);
export function checkRateLimit(key, config) {
    const now = Date.now();
    const entry = stores.get(key);
    if (!entry || entry.resetAt < now) {
        const resetAt = now + config.windowMs;
        stores.set(key, { count: 1, resetAt });
        return { allowed: true, remaining: config.limit - 1, resetAt };
    }
    if (entry.count >= config.limit) {
        return { allowed: false, remaining: 0, resetAt: entry.resetAt };
    }
    entry.count++;
    return { allowed: true, remaining: config.limit - entry.count, resetAt: entry.resetAt };
}
export function rateLimitHeaders(result) {
    return {
        'X-RateLimit-Limit': String(result.remaining + (result.allowed ? 1 : 0)),
        'X-RateLimit-Remaining': String(result.remaining),
        'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
    };
}
// Per-key limits for ingest
export const INGEST_RATE_LIMIT = { limit: 60, windowMs: 60_000 };
export const AUTH_RATE_LIMIT = { limit: 5, windowMs: 60_000 };
export const API_RATE_LIMIT = { limit: 100, windowMs: 60_000 };
