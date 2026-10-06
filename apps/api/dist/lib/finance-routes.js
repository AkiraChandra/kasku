import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { z } from 'zod';
import { failure, success } from '../index.js';
import { parseAmount, AmountParseError } from './money.js';
const sessionCookie = 'kasku_session';
const accountTypes = ['cash', 'bank', 'ewallet', 'credit_card', 'investment', 'other'];
const transactionTypes = ['income', 'expense', 'transfer'];
const budgetPeriods = ['weekly', 'monthly', 'quarterly', 'yearly'];
const debtTypes = ['lent_out', 'borrowed'];
const debtStatuses = ['active', 'settled', 'cancelled'];
const accountSchema = z.object({
    name: z.string().trim().min(1).max(100),
    type: z.enum(accountTypes),
    institution: z.string().trim().max(100).optional(),
    balance: z.union([z.string(), z.number()]).optional(),
});
const categorySchema = z.object({
    name: z.string().trim().min(1).max(100),
    type: z.enum(['income', 'expense']),
    icon: z.string().trim().max(20).optional(),
    color: z.string().trim().max(30).optional(),
});
const transactionSchema = z.object({
    accountId: z.string().uuid(),
    toAccountId: z.string().uuid().optional(),
    categoryId: z.string().uuid().optional(),
    type: z.enum(transactionTypes),
    amount: z.union([z.string(), z.number()]),
    note: z.string().trim().max(500).optional(),
    date: z.string().datetime().optional(),
    merchant: z.string().trim().max(150).optional(),
});
const budgetSchema = z.object({
    categoryId: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(100),
    amount: z.union([z.string(), z.number()]),
    period: z.enum(budgetPeriods),
    startDate: z.string().datetime().optional(),
});
const updateBudgetSchema = z.object({
    categoryId: z.string().uuid().nullable().optional(),
    name: z.string().trim().min(1).max(100).optional(),
    amount: z.union([z.string(), z.number()]).optional(),
    period: z.enum(budgetPeriods).optional(),
});
// ── Debt schemas ──────────────────────────────────────────────
const debtSchema = z.object({
    type: z.enum(debtTypes),
    personName: z.string().trim().min(1).max(200),
    amount: z.union([z.string(), z.number()]),
    description: z.string().trim().max(500).optional(),
    dueDate: z.string().datetime().optional(),
});
const updateDebtSchema = z.object({
    description: z.string().trim().max(500).optional(),
    dueDate: z.string().datetime().nullable().optional(),
    status: z.enum(debtStatuses).optional(),
});
const paymentSchema = z.object({
    amount: z.union([z.string(), z.number()]),
    note: z.string().trim().max(500).optional(),
    paidAt: z.string().datetime().optional(),
});
function validationError(error) {
    const issue = error.issues[0];
    return failure('VALIDATION_ERROR', issue.message, issue.path.join('.'));
}
function parseMoney(value) {
    try {
        return parseAmount(value);
    }
    catch (error) {
        if (error instanceof AmountParseError)
            throw error;
        throw new AmountParseError('INVALID_AMOUNT', 'Jumlah tidak valid');
    }
}
function parseBudgetAmount(value) {
    const amount = parseMoney(value);
    if (amount <= 0)
        throw new AmountParseError('INVALID_AMOUNT', 'Jumlah budget harus lebih besar dari nol');
    return amount;
}
export function createFinanceRoutes(financeRepo, authRepo) {
    const app = new Hono();
    async function currentUserId(c) {
        if (!authRepo)
            return null;
        const token = getCookie(c, sessionCookie);
        if (!token)
            return null;
        const session = await authRepo.findSessionByTokenHash((await import('./auth.js')).hashToken(token));
        return session?.user.id ?? null;
    }
    async function requireUser(c) {
        const userId = await currentUserId(c);
        if (!userId)
            return c.json(failure('UNAUTHORIZED', 'Sesi tidak ditemukan, silakan login'), 401);
        return userId;
    }
    app.get('/accounts', async (c) => {
        const user = await requireUser(c);
        if (user instanceof Response)
            return user;
        return c.json(success(await financeRepo.listAccounts(user)));
    });
    app.post('/accounts', async (c) => {
        const user = await requireUser(c);
        if (user instanceof Response)
            return user;
        let body;
        try {
            body = await c.req.json();
        }
        catch {
            return c.json(failure('INVALID_REQUEST', 'JSON request tidak valid'), 400);
        }
        const parsed = accountSchema.safeParse(body);
        if (!parsed.success)
            return c.json(validationError(parsed.error), 400);
        let balance = 0;
        if (parsed.data.balance !== undefined) {
            try {
                balance = parseMoney(parsed.data.balance);
            }
            catch (error) {
                const message = error instanceof Error ? error.message : 'Jumlah tidak valid';
                return c.json(failure('INVALID_AMOUNT', message, 'balance'), 400);
            }
        }
        const row = await financeRepo.createAccount(user, { ...parsed.data, balance });
        await financeRepo.audit(user, 'create', 'account', row.id, { name: row.name, type: row.type });
        return c.json(success(row), 201);
    });
    app.delete('/accounts/:id', async (c) => {
        const user = await requireUser(c);
        if (user instanceof Response)
            return user;
        const id = c.req.param('id');
        const archived = await financeRepo.archiveAccount(user, id);
        if (!archived)
            return c.json(failure('NOT_FOUND', 'Akun tidak ditemukan'), 404);
        await financeRepo.audit(user, 'archive', 'account', id);
        return c.json(success({ id, archived: true }));
    });
    app.get('/categories', async (c) => {
        const user = await requireUser(c);
        if (user instanceof Response)
            return user;
        return c.json(success(await financeRepo.listCategories(user)));
    });
    app.post('/categories', async (c) => {
        const user = await requireUser(c);
        if (user instanceof Response)
            return user;
        let body;
        try {
            body = await c.req.json();
        }
        catch {
            return c.json(failure('INVALID_REQUEST', 'JSON request tidak valid'), 400);
        }
        const parsed = categorySchema.safeParse(body);
        if (!parsed.success)
            return c.json(validationError(parsed.error), 400);
        const row = await financeRepo.createCategory(user, parsed.data);
        await financeRepo.audit(user, 'create', 'category', row.id, { name: row.name, type: row.type });
        return c.json(success(row), 201);
    });
    app.get('/transactions', async (c) => {
        const user = await requireUser(c);
        if (user instanceof Response)
            return user;
        const status = c.req.query('status');
        return c.json(success(await financeRepo.listTransactions(user, { status })));
    });
    app.post('/transactions', async (c) => {
        const user = await requireUser(c);
        if (user instanceof Response)
            return user;
        const key = c.req.header('Idempotency-Key')?.trim();
        if (!key || key.length > 200)
            return c.json(failure('IDEMPOTENCY_KEY_REQUIRED', 'Header Idempotency-Key wajib diisi'), 400);
        const replay = await financeRepo.getIdempotency(user, key);
        if (replay)
            return c.json(replay.response, 200);
        let body;
        try {
            body = await c.req.json();
        }
        catch {
            return c.json(failure('INVALID_REQUEST', 'JSON request tidak valid'), 400);
        }
        const parsed = transactionSchema.safeParse(body);
        if (!parsed.success)
            return c.json(validationError(parsed.error), 400);
        let amount;
        try {
            amount = parseMoney(parsed.data.amount);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Jumlah tidak valid';
            return c.json(failure('INVALID_AMOUNT', message, 'amount'), 400);
        }
        if (amount <= 0)
            return c.json(failure('INVALID_AMOUNT', 'Jumlah harus lebih besar dari nol', 'amount'), 400);
        try {
            const result = await financeRepo.createTransaction(user, { ...parsed.data, type: parsed.data.type, amount });
            const response = success(result);
            await financeRepo.saveIdempotency(user, key, response, 201);
            const rows = Array.isArray(result) ? result : [result];
            for (const row of rows)
                await financeRepo.audit(user, 'create', 'transaction', row.id, { type: row.type, amount: row.amount });
            return c.json(response, 201);
        }
        catch (error) {
            const code = error instanceof Error ? error.message : 'TRANSACTION_FAILED';
            const messages = {
                ACCOUNT_NOT_FOUND: 'Akun tidak ditemukan', CATEGORY_NOT_FOUND: 'Kategori tidak ditemukan',
                TARGET_ACCOUNT_REQUIRED: 'Akun tujuan transfer wajib diisi dan harus berbeda', INVALID_DATE: 'Tanggal tidak valid',
            };
            const status = code === 'ACCOUNT_NOT_FOUND' || code === 'CATEGORY_NOT_FOUND' ? 404 : 400;
            return c.json(failure(code, messages[code] ?? 'Transaksi gagal'), status);
        }
    });
    app.delete('/transactions/:id', async (c) => {
        const user = await requireUser(c);
        if (user instanceof Response)
            return user;
        const id = c.req.param('id');
        const deleted = await financeRepo.deleteTransaction(user, id);
        if (!deleted)
            return c.json(failure('NOT_FOUND', 'Transaksi tidak ditemukan'), 404);
        await financeRepo.audit(user, 'delete', 'transaction', id);
        return c.json(success({ id, deleted: true }));
    });
    app.patch('/transactions/:id', async (c) => {
        const user = await requireUser(c);
        if (user instanceof Response)
            return user;
        const id = c.req.param('id');
        let body;
        try {
            body = await c.req.json();
        }
        catch {
            return c.json(failure('INVALID_REQUEST', 'JSON request tidak valid'), 400);
        }
        const schema = z.object({ status: z.enum(['pending', 'confirmed', 'rejected']).optional() });
        const parsed = schema.safeParse(body);
        if (!parsed.success)
            return c.json(validationError(parsed.error), 400);
        try {
            if (!financeRepo.updateTransaction)
                return c.json(failure('NOT_IMPLEMENTED', 'Fitur belum didukung'), 501);
            const row = await financeRepo.updateTransaction(user, id, parsed.data);
            await financeRepo.audit(user, 'update', 'transaction', id, parsed.data);
            return c.json(success(row));
        }
        catch (error) {
            if (error instanceof Error && error.message === 'TRANSACTION_NOT_FOUND')
                return c.json(failure('NOT_FOUND', 'Transaksi tidak ditemukan'), 404);
            throw error;
        }
    });
    app.post('/transactions/:id/restore', async (c) => {
        const user = await requireUser(c);
        if (user instanceof Response)
            return user;
        const id = c.req.param('id');
        try {
            if (!financeRepo.restoreTransaction)
                return c.json(failure('NOT_IMPLEMENTED', 'Fitur belum didukung'), 501);
            const row = await financeRepo.restoreTransaction(user, id);
            await financeRepo.audit(user, 'restore', 'transaction', id);
            return c.json(success(row));
        }
        catch (error) {
            if (error instanceof Error && error.message === 'TRANSACTION_NOT_FOUND')
                return c.json(failure('NOT_FOUND', 'Transaksi tidak ditemukan'), 404);
            throw error;
        }
    });
    app.get('/budgets', async (c) => {
        const user = await requireUser(c);
        if (user instanceof Response)
            return user;
        const budgets = await financeRepo.listBudgets(user);
        const budgetsWithProgress = await Promise.all(budgets.map(async (budget) => {
            try {
                return await financeRepo.getBudgetProgress(user, budget.id);
            }
            catch {
                return null;
            }
        }));
        return c.json(success(budgetsWithProgress.filter(Boolean)));
    });
    app.post('/budgets', async (c) => {
        const user = await requireUser(c);
        if (user instanceof Response)
            return user;
        let body;
        try {
            body = await c.req.json();
        }
        catch {
            return c.json(failure('INVALID_REQUEST', 'JSON request tidak valid'), 400);
        }
        const parsed = budgetSchema.safeParse(body);
        if (!parsed.success)
            return c.json(validationError(parsed.error), 400);
        let amount;
        try {
            amount = parseBudgetAmount(parsed.data.amount);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Jumlah tidak valid';
            return c.json(failure('INVALID_AMOUNT', message, 'amount'), 400);
        }
        const row = await financeRepo.createBudget(user, { ...parsed.data, amount });
        await financeRepo.audit(user, 'create', 'budget', row.id, { name: row.name, amount: row.amount, period: row.period });
        return c.json(success(row), 201);
    });
    app.patch('/budgets/:id', async (c) => {
        const user = await requireUser(c);
        if (user instanceof Response)
            return user;
        const id = c.req.param('id');
        let body;
        try {
            body = await c.req.json();
        }
        catch {
            return c.json(failure('INVALID_REQUEST', 'JSON request tidak valid'), 400);
        }
        const parsed = updateBudgetSchema.safeParse(body);
        if (!parsed.success)
            return c.json(validationError(parsed.error), 400);
        if (parsed.data.amount !== undefined) {
            try {
                parseBudgetAmount(parsed.data.amount);
            }
            catch (error) {
                const message = error instanceof Error ? error.message : 'Jumlah tidak valid';
                return c.json(failure('INVALID_AMOUNT', message, 'amount'), 400);
            }
        }
        try {
            const row = await financeRepo.updateBudget(user, id, { ...parsed.data, amount: parsed.data.amount !== undefined ? parseBudgetAmount(parsed.data.amount) : undefined });
            await financeRepo.audit(user, 'update', 'budget', id, parsed.data);
            return c.json(success(row));
        }
        catch (error) {
            if (error instanceof Error && error.message === 'BUDGET_NOT_FOUND')
                return c.json(failure('NOT_FOUND', 'Budget tidak ditemukan'), 404);
            throw error;
        }
    });
    app.delete('/budgets/:id', async (c) => {
        const user = await requireUser(c);
        if (user instanceof Response)
            return user;
        const id = c.req.param('id');
        const deleted = await financeRepo.deleteBudget(user, id);
        if (!deleted)
            return c.json(failure('NOT_FOUND', 'Budget tidak ditemukan'), 404);
        await financeRepo.audit(user, 'delete', 'budget', id);
        return c.json(success({ id, deleted: true }));
    });
    app.get('/budgets/:id/progress', async (c) => {
        const user = await requireUser(c);
        if (user instanceof Response)
            return user;
        const id = c.req.param('id');
        try {
            const progress = await financeRepo.getBudgetProgress(user, id);
            return c.json(success(progress));
        }
        catch (error) {
            if (error instanceof Error && error.message === 'BUDGET_NOT_FOUND')
                return c.json(failure('NOT_FOUND', 'Budget tidak ditemukan'), 404);
            throw error;
        }
    });
    // ── Debt routes ──────────────────────────────────────────────
    app.get('/debts', async (c) => {
        const user = await requireUser(c);
        if (user instanceof Response)
            return user;
        const typeParam = c.req.query('type');
        if (typeParam && !debtTypes.includes(typeParam)) {
            return c.json(failure('VALIDATION_ERROR', 'Jenis hutang tidak valid', 'type'), 400);
        }
        const type = typeParam;
        return c.json(success(await financeRepo.listDebts(user, type)));
    });
    app.post('/debts', async (c) => {
        const user = await requireUser(c);
        if (user instanceof Response)
            return user;
        const key = c.req.header('Idempotency-Key')?.trim();
        if (!key || key.length > 200)
            return c.json(failure('IDEMPOTENCY_KEY_REQUIRED', 'Header Idempotency-Key wajib diisi'), 400);
        const replay = await financeRepo.getIdempotency(user, key);
        if (replay)
            return c.json(replay.response, 200);
        let body;
        try {
            body = await c.req.json();
        }
        catch {
            return c.json(failure('INVALID_REQUEST', 'JSON request tidak valid'), 400);
        }
        const parsed = debtSchema.safeParse(body);
        if (!parsed.success)
            return c.json(validationError(parsed.error), 400);
        let amount;
        try {
            amount = parseMoney(parsed.data.amount);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Jumlah tidak valid';
            return c.json(failure('INVALID_AMOUNT', message, 'amount'), 400);
        }
        if (amount <= 0)
            return c.json(failure('INVALID_AMOUNT', 'Jumlah harus lebih besar dari nol', 'amount'), 400);
        try {
            const row = await financeRepo.createDebt(user, {
                type: parsed.data.type,
                personName: parsed.data.personName,
                amount,
                description: parsed.data.description,
                dueDate: parsed.data.dueDate,
            });
            const response = success({ ...row, personName: parsed.data.personName });
            await financeRepo.saveIdempotency(user, key, response, 201);
            await financeRepo.audit(user, 'create', 'debt', row.id, { type: row.type, amount: row.amount, personName: parsed.data.personName });
            return c.json(response, 201);
        }
        catch (error) {
            const code = error instanceof Error ? error.message : 'DEBT_CREATE_FAILED';
            return c.json(failure(code, 'Gagal membuat hutang'), 400);
        }
    });
    app.get('/debts/:id', async (c) => {
        const user = await requireUser(c);
        if (user instanceof Response)
            return user;
        const id = c.req.param('id');
        const debt = await financeRepo.getDebt(user, id);
        if (!debt)
            return c.json(failure('NOT_FOUND', 'Hutang tidak ditemukan'), 404);
        return c.json(success(debt));
    });
    app.patch('/debts/:id', async (c) => {
        const user = await requireUser(c);
        if (user instanceof Response)
            return user;
        const id = c.req.param('id');
        let body;
        try {
            body = await c.req.json();
        }
        catch {
            return c.json(failure('INVALID_REQUEST', 'JSON request tidak valid'), 400);
        }
        const parsed = updateDebtSchema.safeParse(body);
        if (!parsed.success)
            return c.json(validationError(parsed.error), 400);
        try {
            const row = await financeRepo.updateDebt(user, id, parsed.data);
            await financeRepo.audit(user, 'update', 'debt', id, parsed.data);
            return c.json(success(row));
        }
        catch (error) {
            if (error instanceof Error && error.message === 'DEBT_NOT_FOUND')
                return c.json(failure('NOT_FOUND', 'Hutang tidak ditemukan'), 404);
            throw error;
        }
    });
    app.delete('/debts/:id', async (c) => {
        const user = await requireUser(c);
        if (user instanceof Response)
            return user;
        const id = c.req.param('id');
        const deleted = await financeRepo.deleteDebt(user, id);
        if (!deleted)
            return c.json(failure('NOT_FOUND', 'Hutang tidak ditemukan'), 404);
        await financeRepo.audit(user, 'delete', 'debt', id);
        return c.json(success({ id, deleted: true }));
    });
    app.post('/debts/:id/payments', async (c) => {
        const user = await requireUser(c);
        if (user instanceof Response)
            return user;
        const debtId = c.req.param('id');
        const key = c.req.header('Idempotency-Key')?.trim();
        if (!key || key.length > 200)
            return c.json(failure('IDEMPOTENCY_KEY_REQUIRED', 'Header Idempotency-Key wajib diisi'), 400);
        const replay = await financeRepo.getIdempotency(user, key);
        if (replay)
            return c.json(replay.response, 200);
        let body;
        try {
            body = await c.req.json();
        }
        catch {
            return c.json(failure('INVALID_REQUEST', 'JSON request tidak valid'), 400);
        }
        const parsed = paymentSchema.safeParse(body);
        if (!parsed.success)
            return c.json(validationError(parsed.error), 400);
        let amount;
        try {
            amount = parseMoney(parsed.data.amount);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Jumlah tidak valid';
            return c.json(failure('INVALID_AMOUNT', message, 'amount'), 400);
        }
        if (amount <= 0)
            return c.json(failure('INVALID_AMOUNT', 'Jumlah harus lebih besar dari nol', 'amount'), 400);
        try {
            const result = await financeRepo.recordDebtPayment(user, debtId, {
                amount,
                note: parsed.data.note,
                paidAt: parsed.data.paidAt,
            });
            const response = success(result);
            await financeRepo.saveIdempotency(user, key, response, 201);
            await financeRepo.audit(user, 'payment', 'debt', debtId, { amount: result.payment.amount });
            return c.json(response, 201);
        }
        catch (error) {
            const code = error instanceof Error ? error.message : 'PAYMENT_FAILED';
            const messages = {
                DEBT_NOT_FOUND: 'Hutang tidak ditemukan',
                DEBT_NOT_ACTIVE: 'Hutang sudah lunas atau dibatalkan',
                PAYMENT_EXCEEDS_REMAINING: 'Pembayaran melebihi sisa hutang',
                INVALID_AMOUNT: 'Jumlah tidak valid',
            };
            const status = code === 'DEBT_NOT_FOUND' ? 404 : 400;
            return c.json(failure(code, messages[code] ?? 'Pembayaran gagal'), status);
        }
    });
    app.post('/debts/:id/settle', async (c) => {
        const user = await requireUser(c);
        if (user instanceof Response)
            return user;
        const id = c.req.param('id');
        try {
            const row = await financeRepo.settleDebt(user, id);
            await financeRepo.audit(user, 'settle', 'debt', id);
            return c.json(success(row));
        }
        catch (error) {
            if (error instanceof Error && error.message === 'DEBT_NOT_FOUND')
                return c.json(failure('NOT_FOUND', 'Hutang tidak ditemukan'), 404);
            throw error;
        }
    });
    app.get('/dashboard/summary', async (c) => {
        const user = await requireUser(c);
        if (user instanceof Response)
            return user;
        const summary = await financeRepo.getDashboardSummary(user);
        return c.json(success(summary));
    });
    app.get('/dashboard/cashflow', async (c) => {
        const user = await requireUser(c);
        if (user instanceof Response)
            return user;
        const period = c.req.query('period') || 'daily';
        const cashflow = await financeRepo.getDashboardCashflow(user, period);
        return c.json(success(cashflow));
    });
    app.get('/dashboard/categories', async (c) => {
        const user = await requireUser(c);
        if (user instanceof Response)
            return user;
        const categories = await financeRepo.getDashboardCategories(user);
        return c.json(success(categories));
    });
    app.get('/dashboard/trends', async (c) => {
        const user = await requireUser(c);
        if (user instanceof Response)
            return user;
        const trends = await financeRepo.getDashboardTrends(user);
        return c.json(success(trends));
    });
    return app;
}
