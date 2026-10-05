/**
 * 2FA TOTP routes for web.
 * Mounted at: /api/v1/auth/2fa
 * POST /api/v1/auth/2fa/setup     — generate secret, return provisioning URI + QR
 * POST /api/v1/auth/2fa/verify    — verify TOTP code and enable 2FA
 * POST /api/v1/auth/2fa/disable   — disable 2FA (requires current TOTP)
 * GET  /api/v1/auth/2fa/status    — get 2FA status
 */
import { Hono } from 'hono';
import { Pool } from 'pg';
import type { AuthRepository } from './auth-repo.js';
export declare function totp(secret: Buffer, timeMs?: number): string;
export declare function verifyTotp(secret: Buffer, token: string, timeMs?: number): boolean;
export declare function totpUri(secretBase32: string, email: string, issuer?: string): string;
export type TotpStore = {
    getPendingSecret(userId: string): string | null;
    setPendingSecret(userId: string, secret: string): void;
    clearPendingSecret(userId: string): void;
    getUserSecret(userId: string): string | null;
    setUserSecret(userId: string, secret: string): void;
    clearUserSecret(userId: string): void;
    isUserEnabled(userId: string): boolean;
};
export declare const memoryTotpStore: TotpStore;
export declare function createTotpRoutes(sessionCookie?: string, totpStore?: TotpStore, authRepo?: AuthRepository, pool?: Pool): Hono<import("hono/types").BlankEnv, import("hono/types").BlankSchema, "/">;
