import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../index.js';
import { hashPassword, hashToken } from '../lib/auth.js';
import { inMemoryAuthRepository } from '../lib/auth-repo.js';
import { inMemoryFinanceRepository } from '../lib/finance-repo.js';
const USER_ID = 'user-finance-test';
const SESSION_COOKIE = 'kasku_session=finance-test-token';
async function makeApp() {
    const passwordHash = await hashPassword('test-password');
    const user = await inMemoryAuthRepository.createUser({
        email: `finance-${crypto.randomUUID()}@test.local`,
        passwordHash,
        name: 'Finance Test',
    });
    const token = 'finance-test-token';
    await inMemoryAuthRepository.createSession({
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 60_000),
    });
    return createApp({
        checkDatabase: async () => 'ok',
        authRepo: inMemoryAuthRepository,
        financeRepo: inMemoryFinanceRepository,
    });
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
describe('M1 finance API', () => {
    beforeEach(() => inMemoryFinanceRepository.reset());
    it('requires an authenticated session', async () => {
        const app = createApp({ financeRepo: inMemoryFinanceRepository });
        const response = await app.request('/api/v1/accounts');
        expect(response.status).toBe(401);
    });
    it('creates and lists accounts within the authenticated user scope', async () => {
        const app = await makeApp();
        const created = await requestJson(app, '/api/v1/accounts', {
            method: 'POST',
            body: JSON.stringify({ name: 'BCA', type: 'bank', balance: 250_000 }),
        });
        expect(created.status).toBe(201);
        const account = (await created.json()).data;
        expect(account).toMatchObject({ name: 'BCA', type: 'bank', balance: 250_000 });
        const listed = await requestJson(app, '/api/v1/accounts');
        expect(listed.status).toBe(200);
        expect((await listed.json()).data).toHaveLength(1);
    });
    it('creates categories and records a transaction idempotently', async () => {
        const app = await makeApp();
        const accountResponse = await requestJson(app, '/api/v1/accounts', {
            method: 'POST',
            body: JSON.stringify({ name: 'Tunai', type: 'cash' }),
        });
        const accountId = (await accountResponse.json()).data.id;
        const categoryResponse = await requestJson(app, '/api/v1/categories', {
            method: 'POST',
            body: JSON.stringify({ name: 'Makanan', type: 'expense' }),
        });
        const categoryId = (await categoryResponse.json()).data.id;
        const body = JSON.stringify({ accountId, categoryId, type: 'expense', amount: '35rb', note: 'Nasi goreng' });
        const first = await requestJson(app, '/api/v1/transactions', {
            method: 'POST',
            headers: { 'Idempotency-Key': 'expense-1' },
            body,
        });
        const replay = await requestJson(app, '/api/v1/transactions', {
            method: 'POST',
            headers: { 'Idempotency-Key': 'expense-1' },
            body,
        });
        expect(first.status).toBe(201);
        expect(replay.status).toBe(200);
        const firstBody = await first.json();
        const replayBody = await replay.json();
        expect(firstBody.data.amount).toBe(35_000);
        expect(replayBody.data.id).toBe(firstBody.data.id);
        const accounts = (await (await requestJson(app, '/api/v1/accounts')).json()).data;
        expect(accounts[0].balance).toBe(-35_000);
        const transactions = (await (await requestJson(app, '/api/v1/transactions')).json()).data;
        expect(transactions).toHaveLength(1);
    });
    it('records a transfer across two accounts', async () => {
        const app = await makeApp();
        const first = await requestJson(app, '/api/v1/accounts', { method: 'POST', body: JSON.stringify({ name: 'Tunai', type: 'cash', balance: 100_000 }) });
        const second = await requestJson(app, '/api/v1/accounts', { method: 'POST', body: JSON.stringify({ name: 'BCA', type: 'bank' }) });
        const fromId = (await first.json()).data.id;
        const toId = (await second.json()).data.id;
        const response = await requestJson(app, '/api/v1/transactions', {
            method: 'POST',
            headers: { 'Idempotency-Key': 'transfer-1' },
            body: JSON.stringify({ accountId: fromId, toAccountId: toId, type: 'transfer', amount: 40_000 }),
        });
        expect(response.status).toBe(201);
        expect((await response.json()).data).toHaveLength(2);
        const accounts = (await (await requestJson(app, '/api/v1/accounts')).json()).data;
        expect(accounts.find((a) => a.id === fromId).balance).toBe(60_000);
        expect(accounts.find((a) => a.id === toId).balance).toBe(40_000);
    });
    it('soft-deletes a transaction', async () => {
        const app = await makeApp();
        const account = await requestJson(app, '/api/v1/accounts', { method: 'POST', body: JSON.stringify({ name: 'Tunai', type: 'cash' }) });
        const accountId = (await account.json()).data.id;
        const created = await requestJson(app, '/api/v1/transactions', {
            method: 'POST',
            headers: { 'Idempotency-Key': 'delete-1' },
            body: JSON.stringify({ accountId, type: 'income', amount: 10_000 }),
        });
        const id = (await created.json()).data.id;
        const deleted = await requestJson(app, `/api/v1/transactions/${id}`, { method: 'DELETE' });
        expect(deleted.status).toBe(200);
        const list = (await (await requestJson(app, '/api/v1/transactions')).json()).data;
        expect(list).toHaveLength(0);
    });
});
