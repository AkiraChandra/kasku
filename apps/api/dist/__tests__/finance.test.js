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
describe('M1 finance API', { timeout: 30000 }, () => {
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
    it('creates, lists, updates, tracks, and deletes category budgets', async () => {
        const app = await makeApp();
        const categoryResponse = await requestJson(app, '/api/v1/categories', {
            method: 'POST', body: JSON.stringify({ name: 'Bahan baku', type: 'expense' }),
        });
        const categoryId = (await categoryResponse.json()).data.id;
        const created = await requestJson(app, '/api/v1/budgets', {
            method: 'POST',
            body: JSON.stringify({ categoryId, name: 'Budget bahan baku', amount: '1jt', period: 'monthly' }),
        });
        expect(created.status).toBe(201);
        const budget = (await created.json()).data;
        expect(budget).toMatchObject({ categoryId, amount: 1_000_000, period: 'monthly' });
        const accountResponse = await requestJson(app, '/api/v1/accounts', {
            method: 'POST', body: JSON.stringify({ name: 'Tunai', type: 'cash' }),
        });
        const accountId = (await accountResponse.json()).data.id;
        const transactionResponse = await requestJson(app, '/api/v1/transactions', {
            method: 'POST',
            headers: { 'Idempotency-Key': 'budget-expense-1' },
            body: JSON.stringify({ accountId, categoryId, type: 'expense', amount: 250_000 }),
        });
        expect(transactionResponse.status).toBe(201);
        const listed = await requestJson(app, '/api/v1/budgets');
        expect(listed.status).toBe(200);
        expect((await listed.json()).data[0]).toMatchObject({ spent: 250_000, remaining: 750_000, percentage: 25 });
        const updated = await requestJson(app, `/api/v1/budgets/${budget.id}`, {
            method: 'PATCH', body: JSON.stringify({ amount: '2jt' }),
        });
        expect(updated.status).toBe(200);
        expect((await updated.json()).data.amount).toBe(2_000_000);
        const deleted = await requestJson(app, `/api/v1/budgets/${budget.id}`, { method: 'DELETE' });
        expect(deleted.status).toBe(200);
        expect((await requestJson(app, '/api/v1/budgets')).status).toBe(200);
        expect((await (await requestJson(app, '/api/v1/budgets')).json()).data).toHaveLength(0);
    });
    it('requires authentication for budget endpoints', async () => {
        const app = createApp({ financeRepo: inMemoryFinanceRepository });
        expect((await app.request('/api/v1/budgets')).status).toBe(401);
        expect((await app.request('/api/v1/budgets', { method: 'POST', body: '{}' })).status).toBe(401);
    });
    it('creates, lists, updates, pays, settles, and deletes debts', async () => {
        const app = await makeApp();
        const created = await requestJson(app, '/api/v1/debts', {
            method: 'POST',
            headers: { 'Idempotency-Key': 'debt-create-1' },
            body: JSON.stringify({ type: 'lent_out', personName: 'Budi', amount: '1jt', description: 'Pinjaman pribadi' }),
        });
        expect(created.status).toBe(201);
        const debt = (await created.json()).data;
        expect(debt).toMatchObject({ type: 'lent_out', personName: 'Budi', amount: 1_000_000, remainingAmount: 1_000_000, status: 'active' });
        const replay = await requestJson(app, '/api/v1/debts', {
            method: 'POST',
            headers: { 'Idempotency-Key': 'debt-create-1' },
            body: JSON.stringify({ type: 'lent_out', personName: 'Budi', amount: '1jt', description: 'Pinjaman pribadi' }),
        });
        expect(replay.status).toBe(200);
        expect((await replay.json()).data.id).toBe(debt.id);
        const listed = await requestJson(app, '/api/v1/debts?type=lent_out');
        expect((await listed.json()).data).toHaveLength(1);
        const updated = await requestJson(app, `/api/v1/debts/${debt.id}`, {
            method: 'PATCH', body: JSON.stringify({ description: 'Modal diperbarui' }),
        });
        expect(updated.status).toBe(200);
        expect((await updated.json()).data.description).toBe('Modal diperbarui');
        const payment = await requestJson(app, `/api/v1/debts/${debt.id}/payments`, {
            method: 'POST',
            headers: { 'Idempotency-Key': 'debt-payment-1' },
            body: JSON.stringify({ amount: '250rb' }),
        });
        expect(payment.status).toBe(201);
        expect((await payment.json()).data.debt.remainingAmount).toBe(750_000);
        const paymentReplay = await requestJson(app, `/api/v1/debts/${debt.id}/payments`, {
            method: 'POST',
            headers: { 'Idempotency-Key': 'debt-payment-1' },
            body: JSON.stringify({ amount: '250rb' }),
        });
        expect(paymentReplay.status).toBe(200);
        expect((await paymentReplay.json()).data.debt.remainingAmount).toBe(750_000);
        const settled = await requestJson(app, `/api/v1/debts/${debt.id}/payments`, {
            method: 'POST',
            headers: { 'Idempotency-Key': 'debt-payment-2' },
            body: JSON.stringify({ amount: '750rb' }),
        });
        expect((await settled.json()).data.debt).toMatchObject({ remainingAmount: 0, status: 'settled' });
        const deleted = await requestJson(app, `/api/v1/debts/${debt.id}`, { method: 'DELETE' });
        expect(deleted.status).toBe(200);
        expect((await requestJson(app, `/api/v1/debts/${debt.id}`)).status).toBe(404);
    });
    it('requires authentication for every debt endpoint', async () => {
        const app = createApp({ financeRepo: inMemoryFinanceRepository });
        expect((await app.request('/api/v1/debts')).status).toBe(401);
        expect((await app.request('/api/v1/debts', { method: 'POST', body: '{}' })).status).toBe(401);
        expect((await app.request('/api/v1/debts/id')).status).toBe(401);
        expect((await app.request('/api/v1/debts/id', { method: 'PATCH', body: '{}' })).status).toBe(401);
        expect((await app.request('/api/v1/debts/id', { method: 'DELETE' })).status).toBe(401);
        expect((await app.request('/api/v1/debts/id/payments', { method: 'POST', body: '{}' })).status).toBe(401);
    });
});
describe('M3 Dashboard API', () => {
    beforeEach(() => inMemoryFinanceRepository.reset());
    it('requires authentication for all dashboard endpoints', async () => {
        const app = createApp({ financeRepo: inMemoryFinanceRepository, authRepo: inMemoryAuthRepository });
        expect((await app.request('/api/v1/dashboard/summary')).status).toBe(401);
        expect((await app.request('/api/v1/dashboard/cashflow')).status).toBe(401);
        expect((await app.request('/api/v1/dashboard/categories')).status).toBe(401);
        expect((await app.request('/api/v1/dashboard/trends')).status).toBe(401);
    });
    it('returns summary with zero balances for fresh user', async () => {
        const app = await makeApp();
        const resp = await requestJson(app, '/api/v1/dashboard/summary');
        expect(resp.status).toBe(200);
        const body = await resp.json();
        expect(body.ok).toBe(true);
        expect(body.data).toMatchObject({
            totalBalance: 0,
            incomeThisMonth: 0,
            expenseThisMonth: 0,
            savingsRate: 0,
        });
    });
    it('returns summary with correct balances after transactions', async () => {
        const app = await makeApp();
        const acc = await requestJson(app, '/api/v1/accounts', { method: 'POST', body: JSON.stringify({ name: 'Tunai', type: 'cash', balance: 500_000 }) });
        const accId = (await acc.json()).data.id;
        const catInc = await requestJson(app, '/api/v1/categories', { method: 'POST', body: JSON.stringify({ name: 'Gaji', type: 'income' }) });
        const catIncId = (await catInc.json()).data.id;
        const catExp = await requestJson(app, '/api/v1/categories', { method: 'POST', body: JSON.stringify({ name: 'Makan', type: 'expense' }) });
        const catExpId = (await catExp.json()).data.id;
        await requestJson(app, '/api/v1/transactions', { method: 'POST', headers: { 'Idempotency-Key': 'inc-1' }, body: JSON.stringify({ accountId: accId, categoryId: catIncId, type: 'income', amount: 1_000_000 }) });
        await requestJson(app, '/api/v1/transactions', { method: 'POST', headers: { 'Idempotency-Key': 'exp-1' }, body: JSON.stringify({ accountId: accId, categoryId: catExpId, type: 'expense', amount: 300_000 }) });
        const resp = await requestJson(app, '/api/v1/dashboard/summary');
        expect(resp.status).toBe(200);
        const body = await resp.json();
        expect(body.data.totalBalance).toBe(1_200_000);
        expect(body.data.incomeThisMonth).toBe(1_000_000);
        expect(body.data.expenseThisMonth).toBe(300_000);
        // savings rate = (income - expense) / income = 700k/1000k = 70
        expect(body.data.savingsRate).toBe(70);
    });
    it('returns cashflow with daily breakdown', async () => {
        const app = await makeApp();
        const acc = await requestJson(app, '/api/v1/accounts', { method: 'POST', body: JSON.stringify({ name: 'Tunai', type: 'cash' }) });
        const accId = (await acc.json()).data.id;
        const today = new Date().toISOString().split('T')[0];
        await requestJson(app, '/api/v1/transactions', { method: 'POST', headers: { 'Idempotency-Key': 'cf-1' }, body: JSON.stringify({ accountId: accId, type: 'income', amount: 100_000, date: `${today}T10:00:00.000Z` }) });
        const resp = await requestJson(app, '/api/v1/dashboard/cashflow');
        expect(resp.status).toBe(200);
        const body = await resp.json();
        expect(body.data).toHaveProperty('period');
        expect(body.data).toHaveProperty('income');
        expect(body.data).toHaveProperty('expense');
        expect(body.data).toHaveProperty('net');
        expect(Array.isArray(body.data.breakdown)).toBe(true);
    });
    it('returns categories breakdown with expenses per category', async () => {
        const app = await makeApp();
        const acc = await requestJson(app, '/api/v1/accounts', { method: 'POST', body: JSON.stringify({ name: 'Tunai', type: 'cash' }) });
        const accId = (await acc.json()).data.id;
        const catFood = await requestJson(app, '/api/v1/categories', { method: 'POST', body: JSON.stringify({ name: 'Makanan', type: 'expense' }) });
        const catFoodId = (await catFood.json()).data.id;
        const catTrans = await requestJson(app, '/api/v1/categories', { method: 'POST', body: JSON.stringify({ name: 'Transport', type: 'expense' }) });
        const catTransId = (await catTrans.json()).data.id;
        await requestJson(app, '/api/v1/transactions', { method: 'POST', headers: { 'Idempotency-Key': 'cat-1' }, body: JSON.stringify({ accountId: accId, categoryId: catFoodId, type: 'expense', amount: 50_000 }) });
        await requestJson(app, '/api/v1/transactions', { method: 'POST', headers: { 'Idempotency-Key': 'cat-2' }, body: JSON.stringify({ accountId: accId, categoryId: catTransId, type: 'expense', amount: 30_000 }) });
        const resp = await requestJson(app, '/api/v1/dashboard/categories');
        expect(resp.status).toBe(200);
        const body = await resp.json();
        expect(body.data).toHaveProperty('expenses');
        expect(body.data).toHaveProperty('total');
        expect(body.data.expenses.length).toBe(2);
        expect(body.data.expenses.find((e) => e.name === 'Makanan')?.amount).toBe(50_000);
        expect(body.data.expenses.find((e) => e.name === 'Transport')?.amount).toBe(30_000);
    });
    it('returns trends with month-over-month comparison', async () => {
        const app = await makeApp();
        const resp = await requestJson(app, '/api/v1/dashboard/trends');
        expect(resp.status).toBe(200);
        const body = await resp.json();
        expect(body.data).toHaveProperty('months');
        expect(Array.isArray(body.data.months)).toBe(true);
        expect(body.data).toHaveProperty('comparison');
        expect(body.data).toHaveProperty('currentMonth');
    });
});
