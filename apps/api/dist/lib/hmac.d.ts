/**
 * HMAC-SHA256 webhook signature verification.
 * Used by n8n workflows to authenticate event webhooks from the API.
 */
/**
 * Compute HMAC-SHA256 of the payload using EVENT_HMAC_SECRET.
 * Returns hex string.
 */
export declare function computeHmac(payload: string, secret: string): string;
/**
 * Verify an incoming webhook signature.
 * Uses constant-time comparison to prevent timing attacks.
 */
export declare function verifyHmac(payload: string, signature: string, secret: string): boolean;
/**
 * Generate a signed payload for outgoing webhooks to n8n.
 * Format: "timestamp.payload"
 */
export declare function signWebhookPayload(payload: unknown, secret: string): {
    timestamp: number;
    signature: string;
};
