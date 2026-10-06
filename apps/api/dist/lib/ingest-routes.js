/**
 * Ingest routes: POST /ingest/transactions, POST /ingest/batch, GET /ingest/sources.
 * Scope: ingest:w (dedicated API key for n8n workflows or session cookie).
 * Deduplication: source_ref idempotency + cross-channel dedup.
 * HMAC verification for webhooks.
 */
import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/node-postgres';
import { and, eq, sql, gte, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { failure, success } from '../index.js';
import { checkRateLimit, INGEST_RATE_LIMIT } from './rate-limit.js';
import { transactions, ingestSources, accounts, categories } from '../db/schema/index.js';
import { parseAmount } from './money.js';
import { isAuthorizedForScope, resolveUser } from './auth-resolver.js';
import { verifyHmac } from './hmac.js';
const ingestTransactionSchema = z.object({
    source: z.string().optional(),
    source_ref: z.string().optional(), // idempotency key
    parser: z.string().optional(),
    confidence: z.number().min(0).max(1).optional(),
    raw_input: z.string().max(4096).optional(),
    parsed: z.object({
        type: z.enum(['income', 'expense', 'transfer', 'lend', 'collect', 'borrow', 'repay', 'adjustment']),
        amount: z.union([z.string(), z.number()]),
        merchant: z.string().optional(),
        occurred_at: z.string().datetime().optional(),
        reference_no: z.string().optional(),
        account_hint: z.string().optional(),
        category_hint: z.string().optional(),
        note: z.string().optional(),
    }).optional(),
});
const ingestBatchSchema = z.object({
    source: z.string(),
    source_ref_prefix: z.string().optional(), // prefix for idempotency key
    items: z.array(ingestTransactionSchema).max(200),
});
export function buildBatchSourceRef(source, prefix, itemRef, index) {
    return itemRef ?? `${prefix ?? `${source}:`}${index + 1}`;
}
// Deduplication: match by source_ref OR by (amount + account + time within 60min + similar merchant)
async function findDuplicate(db, userId, parsed, sourceRef) {
    // 1) source_ref exact match
    if (sourceRef) {
        const [existing] = await db.select({ id: transactions.id })
            .from(transactions)
            .where(and(eq(transactions.userId, userId), eq(transactions.sourceRef, sourceRef)))
            .limit(1);
        if (existing)
            return existing.id;
    }
    // 2) Cross-channel dedup: amount + account + time window + merchant similarity
    if (parsed.account_hint && parsed.amount) {
        let amount;
        try {
            amount = parseAmount(String(parsed.amount));
        }
        catch {
            return null;
        }
        const accountRows = await db.select({ id: accounts.id })
            .from(accounts)
            .where(and(eq(accounts.userId, userId), sql `LOWER(${accounts.name}) LIKE ${'%' + (parsed.account_hint ?? '').toLowerCase() + '%'}`))
            .limit(1);
        const accountId = accountRows[0]?.id;
        if (!accountId)
            return null;
        const timeWindow = parsed.occurred_at
            ? new Date(new Date(parsed.occurred_at).getTime() - 60 * 60_000)
            : new Date(Date.now() - 60 * 60_000);
        const candidates = await db.select({ id: transactions.id, merchant: transactions.merchant, date: transactions.date })
            .from(transactions)
            .where(and(eq(transactions.userId, userId), eq(transactions.amount, amount), isNull(transactions.deletedAt), gte(transactions.date, timeWindow)))
            .limit(10);
        for (const c of candidates) {
            if (parsed.merchant && c.merchant) {
                const sim = similarity(parsed.merchant.toLowerCase(), c.merchant.toLowerCase());
                if (sim > 0.7)
                    return c.id;
            }
            else if (parsed.occurred_at) {
                const diff = Math.abs(new Date(c.date).getTime() - new Date(parsed.occurred_at).getTime());
                if (diff < 60 * 60_000)
                    return c.id;
            }
        }
    }
    return null;
}
export function similarity(a, b) {
    if (a === b)
        return 1;
    if (!a.length || !b.length)
        return 0;
    const s1 = a.length, s2 = b.length;
    const dp = Array.from({ length: s1 + 1 }, (_, i) => [i, ...Array(s2).fill(0)]);
    for (let j = 0; j <= s2; j++)
        dp[0][j] = j;
    for (let i = 1; i <= s1; i++) {
        for (let j = 1; j <= s2; j++) {
            dp[i][j] = a[i - 1] === b[j - 1]
                ? dp[i - 1][j - 1]
                : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
    }
    return 1 - dp[s1][s2] / Math.max(s1, s2);
}
async function resolveAccountId(db, userId, hint) {
    if (!hint)
        return null;
    const rows = await db.select({ id: accounts.id }).from(accounts)
        .where(sql `${accounts.userId} = ${userId} AND LOWER(${accounts.name}) LIKE ${'%' + hint.toLowerCase() + '%'}`)
        .limit(1);
    return rows[0]?.id ?? null;
}
async function resolveCategoryId(db, userId, hint) {
    if (!hint)
        return null;
    const rows = await db.select({ id: categories.id }).from(categories)
        .where(sql `(${categories.userId} IS NULL OR ${categories.userId} = ${userId}) AND LOWER(${categories.name}) LIKE ${'%' + hint.toLowerCase() + '%'}`)
        .limit(1);
    return rows[0]?.id ?? null;
}
function determineStatus(parsed, trust, confidence) {
    if (trust === 'auto' && (confidence ?? 0) >= 0.9)
        return 'confirmed';
    return 'pending_review';
}
export function createIngestRoutes(pool, authRepo, sessionCookie = 'kasku_session') {
    const app = new Hono();
    const db = drizzle(pool);
    // Rate limit by API key or IP
    app.use('/*', async (c, next) => {
        const key = (c.req.header('X-Api-Key') ?? c.req.header('x-api-key') ?? c.req.header('x-forwarded-for') ?? 'anon').slice(0, 16);
        const result = checkRateLimit(`ingest:${key}`, INGEST_RATE_LIMIT);
        if (!result.allowed) {
            return c.json(failure('RATE_LIMITED', 'Terlalu banyak permintaan ingest'), 429);
        }
        c.header('X-RateLimit-Limit', String(result.remaining + 1));
        c.header('X-RateLimit-Remaining', String(result.remaining));
        c.header('X-RateLimit-Reset', String(Math.ceil(result.resetAt / 1000)));
        await next();
    });
    async function authenticate(c, requiredScope) {
        const user = await resolveUser(c, pool, authRepo, sessionCookie);
        if (!user) {
            return c.json(failure('UNAUTHORIZED', 'Autentikasi gagal, sertakan X-Api-Key atau cookie kasku_session'), 401);
        }
        if (requiredScope && !isAuthorizedForScope(user, requiredScope)) {
            return c.json(failure('FORBIDDEN', 'API key tidak memiliki scope yang diperlukan'), 403);
        }
        return user.userId;
    }
    // GET /ingest/sources — list registered ingest sources
    app.get('/sources', async (c) => {
        const userId = await authenticate(c, 'web');
        if (userId instanceof Response)
            return userId;
        const rows = await db.select().from(ingestSources).where(eq(ingestSources.userId, userId));
        return c.json(success(rows.map(s => ({
            id: s.id, name: s.name, kind: s.kind, trust: s.trust,
            parserName: s.parserName, isActive: s.isActive,
            totalOk: s.totalOk, totalCorrected: s.totalCorrected,
            createdAt: s.createdAt,
        }))));
    });
    // POST /ingest/transactions — single ingest
    app.post('/transactions', async (c) => {
        const userId = await authenticate(c, 'ingest:w');
        if (userId instanceof Response)
            return userId;
        // Check optional HMAC signature if X-Webhook-Signature header is provided
        const hmacSig = c.req.header('X-Webhook-Signature');
        const secret = process.env.EVENT_HMAC_SECRET;
        if (hmacSig && secret) {
            const rawBody = await c.req.text();
            if (!verifyHmac(rawBody, hmacSig, secret)) {
                return c.json(failure('INVALID_SIGNATURE', 'Tanda tangan webhook HMAC tidak valid'), 401);
            }
            try {
                var body = JSON.parse(rawBody);
            }
            catch {
                return c.json(failure('INVALID_REQUEST', 'JSON tidak valid'), 400);
            }
        }
        else {
            try {
                var body = await c.req.json();
            }
            catch {
                return c.json(failure('INVALID_REQUEST', 'JSON tidak valid'), 400);
            }
        }
        const parsed = ingestTransactionSchema.safeParse(body);
        if (!parsed.success) {
            const err = parsed.error.issues[0];
            return c.json(failure('VALIDATION_ERROR', err.message, err.path.join('.')), 400);
        }
        const data = parsed.data;
        const sourceRef = data.source_ref ?? `${data.source ?? 'unknown'}:${Date.now()}`;
        // Check trust level
        const sourceName = data.source ?? 'unknown';
        const [source] = await db.select({ trust: ingestSources.trust })
            .from(ingestSources)
            .where(and(eq(ingestSources.userId, userId), eq(ingestSources.name, sourceName)))
            .limit(1);
        const trust = source?.trust ?? 'review';
        // Deduplicate
        if (data.parsed) {
            const dupId = await findDuplicate(db, userId, data.parsed, sourceRef);
            if (dupId) {
                // Mark as corroborated, do not create
                await db.update(transactions)
                    .set({ corroboratedBy: sql `${transactions.corroboratedBy} || ${JSON.stringify(sourceRef)}::jsonb` })
                    .where(eq(transactions.id, dupId));
                return c.json(success({ status: 'duplicate_of', transactionId: dupId }));
            }
        }
        if (!data.parsed) {
            return c.json(success({ status: 'pending_review', transactionId: null, reason: 'no_parsed_data' }));
        }
        // Resolve account and category
        const accountId = await resolveAccountId(db, userId, data.parsed.account_hint);
        if (!accountId) {
            return c.json(success({ status: 'pending_review', transactionId: null, reason: 'account_not_found' }));
        }
        const categoryId = await resolveCategoryId(db, userId, data.parsed.category_hint);
        let amount;
        try {
            amount = parseAmount(String(data.parsed.amount));
        }
        catch {
            return c.json(failure('INVALID_AMOUNT', 'Jumlah tidak valid'), 400);
        }
        const occurredAt = data.parsed.occurred_at ? new Date(data.parsed.occurred_at) : new Date();
        const status = determineStatus(data.parsed, trust, data.confidence);
        const [row] = await db.insert(transactions).values({
            userId,
            accountId,
            categoryId: categoryId ?? null,
            type: data.parsed.type,
            amount,
            merchant: data.parsed.merchant ?? null,
            note: data.parsed.note ?? null,
            date: occurredAt,
            status,
            source: data.source ?? 'webhook',
            sourceRef,
            rawInput: data.raw_input ?? null,
        }).returning();
        return c.json(success({ status, transactionId: row.id }), 201);
    });
    // POST /ingest/batch — up to 200 items
    app.post('/batch', async (c) => {
        const userId = await authenticate(c, 'ingest:w');
        if (userId instanceof Response)
            return userId;
        let body;
        try {
            body = await c.req.json();
        }
        catch {
            return c.json(failure('INVALID_REQUEST', 'JSON tidak valid'), 400);
        }
        const parsed = ingestBatchSchema.safeParse(body);
        if (!parsed.success) {
            const err = parsed.error.issues[0];
            return c.json(failure('VALIDATION_ERROR', err.message, err.path.join('.')), 400);
        }
        const results = [];
        for (const [index, item] of parsed.data.items.entries()) {
            const sourceRef = buildBatchSourceRef(parsed.data.source, parsed.data.source_ref_prefix, item.source_ref, index);
            const [source] = await db.select({ trust: ingestSources.trust })
                .from(ingestSources)
                .where(and(eq(ingestSources.userId, userId), eq(ingestSources.name, parsed.data.source)))
                .limit(1);
            const trust = source?.trust ?? 'review';
            if (item.parsed) {
                const dupId = await findDuplicate(db, userId, item.parsed, sourceRef);
                if (dupId) {
                    results.push({ status: 'duplicate_of', transactionId: dupId });
                    continue;
                }
                const accountId = await resolveAccountId(db, userId, item.parsed.account_hint);
                if (!accountId) {
                    results.push({ status: 'pending_review', reason: 'account_not_found' });
                    continue;
                }
                const categoryId = await resolveCategoryId(db, userId, item.parsed.category_hint);
                let amount;
                try {
                    amount = parseAmount(String(item.parsed.amount));
                }
                catch {
                    results.push({ status: 'rejected', reason: 'invalid_amount' });
                    continue;
                }
                const occurredAt = item.parsed.occurred_at ? new Date(item.parsed.occurred_at) : new Date();
                const status = determineStatus(item.parsed, trust, item.confidence);
                const [row] = await db.insert(transactions).values({
                    userId,
                    accountId,
                    categoryId: categoryId ?? null,
                    type: item.parsed.type,
                    amount,
                    merchant: item.parsed.merchant ?? null,
                    note: item.parsed.note ?? null,
                    date: occurredAt,
                    status,
                    source: parsed.data.source,
                    sourceRef,
                    rawInput: item.raw_input ?? null,
                }).returning();
                results.push({ status, transactionId: row.id });
            }
            else {
                results.push({ status: 'pending_review', reason: 'no_parsed_data' });
            }
        }
        return c.json(success({ total: results.length, results }));
    });
    return app;
}
