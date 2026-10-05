/**
 * HMAC-SHA256 webhook signature verification.
 * Used by n8n workflows to authenticate event webhooks from the API.
 */
import { createHmac, timingSafeEqual } from 'crypto';
/**
 * Compute HMAC-SHA256 of the payload using EVENT_HMAC_SECRET.
 * Returns hex string.
 */
export function computeHmac(payload, secret) {
    return createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}
/**
 * Verify an incoming webhook signature.
 * Uses constant-time comparison to prevent timing attacks.
 */
export function verifyHmac(payload, signature, secret) {
    if (!signature || !secret)
        return false;
    try {
        const expected = computeHmac(payload, secret);
        const sigBuf = Buffer.from(signature, 'hex');
        const expBuf = Buffer.from(expected, 'hex');
        if (sigBuf.length !== expBuf.length)
            return false;
        return timingSafeEqual(sigBuf, expBuf);
    }
    catch {
        return false;
    }
}
/**
 * Generate a signed payload for outgoing webhooks to n8n.
 * Format: "timestamp.payload"
 */
export function signWebhookPayload(payload, secret) {
    const timestamp = Math.floor(Date.now() / 1000);
    const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const data = `${timestamp}.${body}`;
    const signature = createHmac('sha256', secret).update(data, 'utf8').digest('hex');
    return { timestamp, signature };
}
