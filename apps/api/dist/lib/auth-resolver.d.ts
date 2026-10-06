/**
 * Unified auth resolver for reports, digest, ingest, and totp routes.
 * Resolves user from session cookie or X-Api-Key.
 */
import { Pool } from 'pg';
import type { AuthRepository } from './auth-repo.js';
export type ResolvedUser = {
    userId: string;
    userEmail: string;
    authMethod: 'session' | 'api_key';
    scopes?: string[] | null;
};
export declare function hasApiScope(scopes: string[] | null | undefined, requiredScope: string): boolean;
export declare function isAuthorizedForScope(user: Pick<ResolvedUser, 'authMethod' | 'scopes'>, requiredScope: string): boolean;
export declare function resolveUser(c: any, pool?: Pool, authRepo?: AuthRepository, sessionCookie?: string): Promise<ResolvedUser | null>;
