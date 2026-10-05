/**
 * Unified auth resolver for reports, digest, ingest, and totp routes.
 * Resolves user from session cookie or X-Api-Key.
 */
import { Pool } from 'pg';
import type { AuthRepository } from './auth-repo.js';
export declare function resolveUser(c: any, pool?: Pool, authRepo?: AuthRepository, sessionCookie?: string): Promise<{
    userId: string;
    userEmail: string;
    authMethod: 'session' | 'api_key';
} | null>;
