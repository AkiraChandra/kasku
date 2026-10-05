/**
 * Digest API routes.
 * GET /digest/weekly, /digest/monthly
 */
import { Hono } from 'hono';
import { Pool } from 'pg';
import type { AuthRepository } from './auth-repo.js';
export declare function createDigestRoutes(pool: Pool, authRepo?: AuthRepository, sessionCookie?: string): Hono<import("hono/types").BlankEnv, import("hono/types").BlankSchema, "/">;
