import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../index.js';
import { hashPassword, hashToken } from '../lib/auth.js';
import { inMemoryAuthRepository } from '../lib/auth-repo.js';
import { inMemoryFinanceRepository, memoryTransactions } from '../lib/finance-repo.js';
const SESSION_COOKIE = 'kasku_session=review-test-token';
async function makeApp() {
    const passwordHash = await hashPassword('test-password');
    const user = await inMemoryAuthRepository.createUser({
        email: `review-${crypto.randomUUID()}@test.local`,
        passwordHash,
        name: 'Review Test',
    });
    const token = 'review-test-token';
    await inMemoryAuthRepository.createSession({
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 60_000),
    });
    return {
        app: createApp({
            checkDatabase: async () => 'ok',
            authRepo: inMemoryAuthRepository,
            financeRepo: inMemoryFinanceRepository,
        }),
        userId: user.id,
    };
}
async function requestJson(app, path, init = {}) {
    return app.request(path, {
        ...init,
        headers: {
            'content-type': 'application/json',
            cookie: SESSION_COOKIE,
            ...(init.headers ?? {}),
        },
    });
}
describe('transaction status and review', { timeout: 30000 }, () => {
    beforeEach(() => {
        inMemoryFinanceRepository.reset?.();
        memoryTransactions.clear();
    });
    it('lists transactions filtered by status=pending_review', async () => {
        const { app, userId } = await makeApp();
        // Create account
        const acc = await requestJson(app, '/api/v1/accounts', {
            method: 'POST',
            body: JSON.stringify({ name: 'BCA', type: 'bank' }),
        });
        const accountId = (await acc.json()).data.id;
        // Create a "pending_review" transaction by directly inserting into in-memory repo
        // The API should return it when filtering by status=pending_review
        memoryTransactions.set('pending-tx-1', {
            id: 'pending-tx-1',
            userId,
            accountId,
            categoryId: null,
            type: 'expense',
            amount: 50000,
            note: null,
            date: new Date().toISOString(),
            merchant: 'Test Merchant',
            parentId: null,
            status: 'pending_review',
            deletedAt: null,
            createdAt: new Date().toISOString(),
        });
        const listed = await requestJson(app, '/api/v1/transactions?status=pending_review');
        expect(listed.status).toBe(200);
        const data = (await listed.json()).data;
        expect(data.some((t) => t.id === 'pending-tx-1')).toBe(true);
    });
    it('updates a transaction status via PATCH /transactions/:id', async () => {
        const { app, userId } = await makeApp();
        const acc = await requestJson(app, '/api/v1/accounts', {
            method: 'POST',
            body: JSON.stringify({ name: 'BCA', type: 'bank' }),
        });
        const accountId = (await acc.json()).data.id;
        memoryTransactions.set('tx-update-1', {
            id: 'tx-update-1',
            userId,
            accountId,
            categoryId: null,
            type: 'expense',
            amount: 30000,
            note: null,
            date: new Date().toISOString(),
            merchant: 'Test',
            parentId: null,
            status: 'pending_review',
            deletedAt: null,
            createdAt: new Date().toISOString(),
        });
        const updated = await requestJson(app, '/api/v1/transactions/tx-update-1', {
            method: 'PATCH',
            body: JSON.stringify({ status: 'confirmed' }),
        });
        expect(updated.status).toBe(200);
        const result = (await updated.json()).data;
        expect(result.id).toBe('tx-update-1');
    });
    it('restores a soft-deleted transaction via POST /transactions/:id/restore', async () => {
        const { app, userId } = await makeApp();
        const acc = await requestJson(app, '/api/v1/accounts', {
            method: 'POST',
            body: JSON.stringify({ name: 'BCA', type: 'bank' }),
        });
        const accountId = (await acc.json()).data.id;
        memoryTransactions.set('tx-deleted-1', {
            id: 'tx-deleted-1',
            userId,
            accountId,
            categoryId: null,
            type: 'income',
            amount: 100000,
            note: null,
            date: new Date().toISOString(),
            merchant: 'Salary',
            parentId: null,
            deletedAt: new Date().toISOString(), // soft-deleted
            createdAt: new Date().toISOString(),
        });
        const restored = await requestJson(app, '/api/v1/transactions/tx-deleted-1/restore', {
            method: 'POST',
        });
        expect(restored.status).toBe(200);
        const result = (await restored.json()).data;
        expect(result.deletedAt).toBeNull();
    });
});
