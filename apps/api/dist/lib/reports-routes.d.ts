/**
 * Reports and Export API routes.
 * GET /reports/summary, /reports/category-breakdown, /reports/cashflow, /reports/export
 */
import { Hono } from 'hono';
import { Pool } from 'pg';
import type { AuthRepository } from './auth-repo.js';
export declare function createReportsRoutes(pool: Pool, authRepo?: AuthRepository, sessionCookie?: string): Hono<import("hono/types").BlankEnv, import("hono/types").BlankSchema, "/">;
