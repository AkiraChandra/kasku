/**
 * Rate limiting middleware using in-process sliding window.
 * Keyed by API key hash or IP. Thread-safe enough for single-process Hono.
 */
export type RateLimitConfig = {
    limit: number;
    windowMs: number;
    keyByIp?: boolean;
};
export declare function checkRateLimit(key: string, config: RateLimitConfig): {
    allowed: boolean;
    remaining: number;
    resetAt: number;
};
export declare function rateLimitHeaders(result: ReturnType<typeof checkRateLimit>): Record<string, string>;
export declare const INGEST_RATE_LIMIT: RateLimitConfig;
export declare const AUTH_RATE_LIMIT: RateLimitConfig;
export declare const API_RATE_LIMIT: RateLimitConfig;
