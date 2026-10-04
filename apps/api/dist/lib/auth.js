import { randomBytes, createHash } from 'crypto';
import { hash, verify } from '@node-rs/argon2';
export const SESSION_TOKEN_BYTES = 32;
export async function hashPassword(password) {
    return hash(password, {
        algorithm: 2 /* Algorithm.Argon2id */,
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 4,
    });
}
export async function verifyPassword(hash_, password) {
    try {
        return await verify(hash_, password);
    }
    catch {
        return false;
    }
}
export function generateSessionToken() {
    return randomBytes(SESSION_TOKEN_BYTES).toString('base64url');
}
export function hashToken(token) {
    return createHash('sha256').update(token).digest('hex');
}
