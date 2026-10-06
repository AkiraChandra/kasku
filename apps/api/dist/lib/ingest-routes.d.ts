/**
 * Ingest routes: POST /ingest/transactions, POST /ingest/batch, GET /ingest/sources.
 * Scope: ingest:w (dedicated API key for n8n workflows or session cookie).
 * Deduplication: source_ref idempotency + cross-channel dedup.
 * HMAC verification for webhooks.
 */
import { Hono } from 'hono';
import { Pool } from 'pg';
import type { AuthRepository } from './auth-repo.js';
export declare function buildBatchSourceRef(source: string, prefix: string | undefined, itemRef: string | undefined, index: number): string;
export declare function similarity(a: string, b: string): number;
export declare function createIngestRoutes(pool: Pool, authRepo?: AuthRepository, sessionCookie?: string): Hono<import("hono/types").BlankEnv, import("hono/types").BlankSchema, "/">;
