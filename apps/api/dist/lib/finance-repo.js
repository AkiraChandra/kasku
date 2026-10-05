import { and, desc, eq, gte, isNull, lt, lte, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { accounts, auditLog, budgets, categories, contacts, debts, debtPayments, idempotencyKeys, transactions } from '../db/schema/index.js';
const now = () => new Date().toISOString();
const memoryAccounts = new Map();
const memoryCategories = new Map();
const memoryTransactions = new Map();
const memoryBudgets = new Map();
const memoryDebts = new Map();
const memoryDebtPayments = new Map();
const memoryContacts = new Map();
const memoryIdempotency = new Map();
function periodBounds(budget, nowDate = new Date()) {
    const configuredStart = new Date(budget.startDate);
    const start = new Date(configuredStart);
    while (true) {
        const next = new Date(start);
        if (budget.period === 'weekly')
            next.setUTCDate(next.getUTCDate() + 7);
        else if (budget.period === 'monthly')
            next.setUTCMonth(next.getUTCMonth() + 1);
        else if (budget.period === 'quarterly')
            next.setUTCMonth(next.getUTCMonth() + 3);
        else
            next.setUTCFullYear(next.getUTCFullYear() + 1);
        if (next > nowDate)
            return { start, end: next };
        start.setTime(next.getTime());
    }
}
function budgetProgress(budget, transactions) {
    const { start, end } = periodBounds(budget);
    const spent = [...transactions].filter((transaction) => (transaction.userId === budget.userId && transaction.categoryId === budget.categoryId &&
        transaction.type === 'expense' && transaction.deletedAt === null &&
        new Date(transaction.date) >= start && new Date(transaction.date) < end)).reduce((total, transaction) => total + transaction.amount, 0);
    return {
        budget,
        spent,
        remaining: Math.max(0, budget.amount - spent),
        percentage: budget.amount === 0 ? 0 : Math.min(100, Math.round((spent / budget.amount) * 100)),
        periodStart: start.toISOString(),
        periodEnd: end.toISOString(),
    };
}
const memoryAudit = [];
function scopedKey(userId, key) {
    return `${userId}:${key}`;
}
function monthKey(date) {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}
function monthStart(date = new Date()) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}
function sumFlow(rows, type) {
    return rows.filter((row) => row.type === type).reduce((sum, row) => sum + row.amount, 0);
}
function dashboardFromRows(accounts, categories, transactions) {
    const nowDate = new Date();
    const currentStart = monthStart(nowDate);
    const currentRows = transactions.filter((row) => new Date(row.date) >= currentStart);
    const income = sumFlow(currentRows, 'income');
    const expense = sumFlow(currentRows, 'expense');
    const categoryById = new Map(categories.map((category) => [category.id, category.name]));
    const categoryAmounts = new Map();
    for (const row of currentRows) {
        if (row.type !== 'expense')
            continue;
        const id = row.categoryId ?? 'uncategorized';
        const name = row.categoryId ? (categoryById.get(row.categoryId) ?? 'Lainnya') : 'Lainnya';
        const existing = categoryAmounts.get(id) ?? { id, name, amount: 0 };
        existing.amount += row.amount;
        categoryAmounts.set(id, existing);
    }
    const categoryTotal = [...categoryAmounts.values()].reduce((sum, row) => sum + row.amount, 0);
    const months = Array.from({ length: 6 }, (_, index) => {
        const date = new Date(Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth() - (5 - index), 1));
        const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
        const rows = transactions.filter((row) => {
            const transactionDate = new Date(row.date);
            return transactionDate >= date && transactionDate < next;
        });
        const monthIncome = sumFlow(rows, 'income');
        const monthExpense = sumFlow(rows, 'expense');
        return { month: monthKey(date), income: monthIncome, expense: monthExpense, net: monthIncome - monthExpense };
    });
    const currentMonth = months[months.length - 1];
    const previousMonth = months[months.length - 2];
    return {
        summary: {
            totalBalance: accounts.filter((account) => !account.isArchived).reduce((sum, account) => sum + account.balance, 0),
            incomeThisMonth: income,
            expenseThisMonth: expense,
            savingsRate: income === 0 ? 0 : Math.round(((income - expense) / income) * 100),
        },
        categoryData: {
            total: categoryTotal,
            expenses: [...categoryAmounts.values()]
                .map((row) => ({ ...row, percentage: categoryTotal === 0 ? 0 : Math.round((row.amount * 100) / categoryTotal) }))
                .sort((a, b) => b.amount - a.amount),
        },
        trendData: {
            months,
            currentMonth: currentMonth.month,
            comparison: {
                incomeChange: currentMonth.income - previousMonth.income,
                expenseChange: currentMonth.expense - previousMonth.expense,
                netChange: currentMonth.net - previousMonth.net,
            },
        },
    };
}
function cashflowFromRows(transactions, period = 'daily') {
    const nowDate = new Date();
    const days = period === 'daily' ? 7 : 8;
    const buckets = new Map();
    for (let index = days - 1; index >= 0; index -= 1) {
        const date = new Date(nowDate);
        if (period === 'daily')
            date.setUTCDate(date.getUTCDate() - index);
        else
            date.setUTCDate(date.getUTCDate() - (index * 7));
        let label;
        if (period === 'daily')
            label = date.toISOString().slice(0, 10);
        else {
            const weekStart = new Date(date);
            weekStart.setUTCDate(date.getUTCDate() - date.getUTCDay());
            label = weekStart.toISOString().slice(0, 10);
        }
        buckets.set(label, { income: 0, expense: 0 });
    }
    for (const row of transactions) {
        const date = new Date(row.date);
        let label;
        if (period === 'daily')
            label = date.toISOString().slice(0, 10);
        else {
            const weekStart = new Date(date);
            weekStart.setUTCDate(date.getUTCDate() - date.getUTCDay());
            label = weekStart.toISOString().slice(0, 10);
        }
        const bucket = buckets.get(label);
        if (!bucket)
            continue;
        if (row.type === 'income')
            bucket.income += row.amount;
        if (row.type === 'expense')
            bucket.expense += row.amount;
    }
    const breakdown = [...buckets.entries()].map(([label, values]) => ({ ...values, label, net: values.income - values.expense }));
    return {
        period,
        income: breakdown.reduce((sum, row) => sum + row.income, 0),
        expense: breakdown.reduce((sum, row) => sum + row.expense, 0),
        net: breakdown.reduce((sum, row) => sum + row.net, 0),
        breakdown,
    };
}
export const inMemoryFinanceRepository = {
    reset() {
        memoryAccounts.clear();
        memoryCategories.clear();
        memoryTransactions.clear();
        memoryBudgets.clear();
        memoryDebts.clear();
        memoryDebtPayments.clear();
        memoryContacts.clear();
        memoryIdempotency.clear();
        memoryAudit.length = 0;
    },
    async listAccounts(userId) {
        return [...memoryAccounts.values()].filter((row) => row.userId === userId && row.isArchived === false);
    },
    async createAccount(userId, input) {
        const timestamp = now();
        const row = {
            id: crypto.randomUUID(), userId, name: input.name, type: input.type,
            institution: input.institution ?? null, balance: input.balance ?? 0,
            currency: 'IDR', isArchived: false, createdAt: timestamp, updatedAt: timestamp,
        };
        memoryAccounts.set(row.id, row);
        return row;
    },
    async archiveAccount(userId, id) {
        const row = memoryAccounts.get(id);
        if (!row || row.userId !== userId || row.isArchived)
            return false;
        row.isArchived = true;
        row.updatedAt = now();
        return true;
    },
    async listCategories(userId) {
        return [...memoryCategories.values()].filter((row) => row.isArchived === false && (row.userId === null || row.userId === userId));
    },
    async createCategory(userId, input) {
        const row = {
            id: crypto.randomUUID(), userId, name: input.name, type: input.type,
            icon: input.icon ?? null, color: input.color ?? null, isArchived: false, createdAt: now(),
        };
        memoryCategories.set(row.id, row);
        return row;
    },
    async listTransactions(userId) {
        return [...memoryTransactions.values()]
            .filter((row) => row.userId === userId && row.deletedAt === null)
            .sort((a, b) => b.date.localeCompare(a.date));
    },
    async createTransaction(userId, input) {
        const account = memoryAccounts.get(input.accountId);
        if (!account || account.userId !== userId || account.isArchived)
            throw new Error('ACCOUNT_NOT_FOUND');
        if (input.categoryId) {
            const category = memoryCategories.get(input.categoryId);
            if (!category || category.isArchived || (category.userId !== null && category.userId !== userId))
                throw new Error('CATEGORY_NOT_FOUND');
        }
        const timestamp = now();
        const date = input.date ? new Date(input.date).toISOString() : timestamp;
        if (input.type === 'transfer') {
            const target = input.toAccountId ? memoryAccounts.get(input.toAccountId) : undefined;
            if (!target || target.userId !== userId || target.isArchived || target.id === account.id)
                throw new Error('TARGET_ACCOUNT_REQUIRED');
            const firstId = crypto.randomUUID();
            const first = {
                id: firstId, userId, accountId: account.id, categoryId: null, type: 'transfer', amount: input.amount,
                note: input.note ?? null, date, merchant: input.merchant ?? null, parentId: null, deletedAt: null, createdAt: timestamp,
            };
            const second = {
                ...first, id: crypto.randomUUID(), accountId: target.id, parentId: firstId,
            };
            memoryTransactions.set(first.id, first);
            memoryTransactions.set(second.id, second);
            account.balance -= input.amount;
            target.balance += input.amount;
            account.updatedAt = target.updatedAt = timestamp;
            return [first, second];
        }
        const row = {
            id: crypto.randomUUID(), userId, accountId: account.id, categoryId: input.categoryId ?? null,
            type: input.type, amount: input.amount, note: input.note ?? null, date,
            merchant: input.merchant ?? null, parentId: null, deletedAt: null, createdAt: timestamp,
        };
        memoryTransactions.set(row.id, row);
        account.balance += input.type === 'income' ? input.amount : -input.amount;
        account.updatedAt = timestamp;
        return row;
    },
    async deleteTransaction(userId, id) {
        const row = memoryTransactions.get(id);
        if (!row || row.userId !== userId || row.deletedAt !== null)
            return false;
        const groupId = row.parentId ?? row.id;
        const group = [...memoryTransactions.values()].filter((item) => item.id === groupId || item.parentId === groupId);
        for (const item of group) {
            if (item.deletedAt !== null)
                continue;
            const account = memoryAccounts.get(item.accountId);
            if (account) {
                const delta = item.type === 'income' ? -item.amount : item.type === 'expense' ? item.amount : (item.id === groupId ? item.amount : -item.amount);
                account.balance += delta;
                account.updatedAt = now();
            }
            item.deletedAt = now();
        }
        return true;
    },
    async listBudgets(userId) {
        return [...memoryBudgets.values()].filter((row) => row.userId === userId);
    },
    async createBudget(userId, input) {
        const timestamp = now();
        const row = {
            id: crypto.randomUUID(), userId,
            categoryId: input.categoryId ?? null,
            name: input.name,
            amount: input.amount,
            period: input.period,
            startDate: input.startDate ?? timestamp,
            createdAt: timestamp, updatedAt: timestamp,
        };
        memoryBudgets.set(row.id, row);
        return row;
    },
    async updateBudget(userId, id, input) {
        const row = memoryBudgets.get(id);
        if (!row || row.userId !== userId)
            throw new Error('BUDGET_NOT_FOUND');
        const updated = {
            ...row,
            categoryId: input.categoryId !== undefined ? input.categoryId : row.categoryId,
            name: input.name ?? row.name,
            amount: input.amount ?? row.amount,
            period: input.period ?? row.period,
            updatedAt: now(),
        };
        memoryBudgets.set(id, updated);
        return updated;
    },
    async deleteBudget(userId, id) {
        const row = memoryBudgets.get(id);
        if (!row || row.userId !== userId)
            return false;
        memoryBudgets.delete(id);
        return true;
    },
    async getBudgetProgress(userId, id) {
        const row = memoryBudgets.get(id);
        if (!row || row.userId !== userId)
            throw new Error('BUDGET_NOT_FOUND');
        const userTransactions = [...memoryTransactions.values()].filter((t) => t.userId === userId);
        return budgetProgress(row, userTransactions);
    },
    async getIdempotency(userId, key) {
        const row = memoryIdempotency.get(scopedKey(userId, key));
        if (!row || row.expiresAt <= Date.now())
            return null;
        return row;
    },
    async saveIdempotency(userId, key, response, statusCode) {
        memoryIdempotency.set(scopedKey(userId, key), { response, statusCode, expiresAt: Date.now() + 86_400_000 });
    },
    async audit(userId, action, entityType, entityId, changes) {
        memoryAudit.push({ userId, action, entityType, entityId, changes });
    },
    // ── Debt in-memory impl ────────────────────────────────────────
    async listDebts(userId, type) {
        return [...memoryDebts.values()]
            .filter((row) => row.userId === userId && (type ? row.type === type : true))
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    async createDebt(userId, input) {
        const timestamp = now();
        // upsert contact by name (in-memory: create if not exists)
        let contactId = null;
        if (input.personName) {
            const key = `${userId}:${input.personName}`;
            let contact = memoryContacts.get(key);
            if (!contact) {
                contact = { id: crypto.randomUUID(), name: input.personName };
                memoryContacts.set(key, contact);
            }
            contactId = contact.id;
        }
        const row = {
            id: crypto.randomUUID(),
            userId,
            contactId,
            personName: input.personName,
            type: input.type,
            amount: input.amount,
            remainingAmount: input.remainingAmount ?? input.amount,
            currency: 'IDR',
            description: input.description ?? null,
            dueDate: input.dueDate ?? null,
            status: 'active',
            createdAt: timestamp,
            updatedAt: timestamp,
        };
        memoryDebts.set(row.id, row);
        return row;
    },
    async getDebt(userId, id) {
        const row = memoryDebts.get(id);
        if (!row || row.userId !== userId)
            return null;
        return row;
    },
    async updateDebt(userId, id, input) {
        const row = memoryDebts.get(id);
        if (!row || row.userId !== userId)
            throw new Error('DEBT_NOT_FOUND');
        const updated = {
            ...row,
            description: input.description !== undefined ? input.description : row.description,
            dueDate: input.dueDate !== undefined ? input.dueDate : row.dueDate,
            status: input.status ?? row.status,
            updatedAt: now(),
        };
        memoryDebts.set(id, updated);
        return updated;
    },
    async deleteDebt(userId, id) {
        const row = memoryDebts.get(id);
        if (!row || row.userId !== userId)
            return false;
        memoryDebts.delete(id);
        return true;
    },
    async recordDebtPayment(userId, debtId, input) {
        const debt = memoryDebts.get(debtId);
        if (!debt || debt.userId !== userId)
            throw new Error('DEBT_NOT_FOUND');
        if (debt.status !== 'active')
            throw new Error('DEBT_NOT_ACTIVE');
        if (input.amount <= 0)
            throw new Error('INVALID_AMOUNT');
        if (input.amount > debt.remainingAmount)
            throw new Error('PAYMENT_EXCEEDS_REMAINING');
        const timestamp = now();
        const payment = {
            id: crypto.randomUUID(),
            userId,
            debtId,
            amount: input.amount,
            note: input.note ?? null,
            paidAt: input.paidAt ?? timestamp,
            createdAt: timestamp,
        };
        memoryDebtPayments.set(payment.id, payment);
        const newRemaining = debt.remainingAmount - input.amount;
        const newStatus = newRemaining === 0 ? 'settled' : debt.status;
        const updatedDebt = {
            ...debt,
            remainingAmount: newRemaining,
            status: newStatus,
            updatedAt: timestamp,
        };
        memoryDebts.set(debtId, updatedDebt);
        return { payment, debt: updatedDebt };
    },
    async settleDebt(userId, id) {
        return this.updateDebt(userId, id, { status: 'settled' });
    },
    async getDashboardSummary(userId) {
        const accounts = [...memoryAccounts.values()].filter((row) => row.userId === userId);
        const transactions = [...memoryTransactions.values()].filter((row) => row.userId === userId && row.deletedAt === null);
        return dashboardFromRows(accounts, [...memoryCategories.values()], transactions).summary;
    },
    async getDashboardCashflow(userId, period = 'daily') {
        const transactions = [...memoryTransactions.values()].filter((row) => row.userId === userId && row.deletedAt === null);
        return cashflowFromRows(transactions, period);
    },
    async getDashboardCategories(userId) {
        const transactions = [...memoryTransactions.values()].filter((row) => row.userId === userId && row.deletedAt === null);
        return dashboardFromRows([...memoryAccounts.values()].filter((row) => row.userId === userId), [...memoryCategories.values()], transactions).categoryData;
    },
    async getDashboardTrends(userId) {
        const transactions = [...memoryTransactions.values()].filter((row) => row.userId === userId && row.deletedAt === null);
        return dashboardFromRows([...memoryAccounts.values()].filter((row) => row.userId === userId), [...memoryCategories.values()], transactions).trendData;
    },
};
function accountToRow(row) {
    return {
        id: row.id, userId: row.userId, name: row.name, type: row.type, institution: row.institution,
        balance: Number(row.balance), currency: row.currency ?? 'IDR', isArchived: row.isArchived ?? false,
        createdAt: (row.createdAt ?? new Date(0)).toISOString(), updatedAt: (row.updatedAt ?? new Date(0)).toISOString(),
    };
}
function categoryToRow(row) {
    return {
        id: row.id, userId: row.userId, name: row.name, type: row.type, icon: row.icon, color: row.color,
        isArchived: row.isArchived ?? false, createdAt: (row.createdAt ?? new Date(0)).toISOString(),
    };
}
function transactionToRow(row) {
    return {
        id: row.id, userId: row.userId, accountId: row.accountId, categoryId: row.categoryId,
        type: row.type, amount: Number(row.amount), note: row.note, date: row.date.toISOString(),
        merchant: row.merchant, parentId: row.parentId, deletedAt: row.deletedAt?.toISOString() ?? null,
        createdAt: (row.createdAt ?? new Date(0)).toISOString(),
    };
}
function budgetToRow(row) {
    return {
        id: row.id,
        userId: row.userId,
        categoryId: row.categoryId ?? null,
        name: row.name ?? 'Budget',
        amount: Number(row.amount),
        period: row.period,
        startDate: (row.startDate ?? new Date(0)).toISOString(),
        createdAt: (row.createdAt ?? new Date(0)).toISOString(),
        updatedAt: (row.updatedAt ?? new Date(0)).toISOString(),
    };
}
function debtToRow(row) {
    return {
        id: row.id,
        userId: row.userId,
        contactId: row.contactId ?? null,
        personName: row.personName ?? null,
        type: row.type,
        amount: Number(row.amount),
        remainingAmount: Number(row.remainingAmount),
        currency: row.currency ?? 'IDR',
        description: row.description,
        dueDate: row.dueDate?.toISOString() ?? null,
        status: row.status,
        createdAt: (row.createdAt ?? new Date(0)).toISOString(),
        updatedAt: (row.updatedAt ?? new Date(0)).toISOString(),
    };
}
function debtPaymentToRow(row) {
    return {
        id: row.id,
        userId: row.userId,
        debtId: row.debtId,
        amount: Number(row.amount),
        note: row.note,
        paidAt: (row.paidAt ?? new Date(0)).toISOString(),
        createdAt: (row.createdAt ?? new Date(0)).toISOString(),
    };
}
function dbPeriodBounds(budget, nowDate = new Date()) {
    const start = new Date(budget.startDate ?? new Date(0));
    while (true) {
        const next = new Date(start);
        if (budget.period === 'weekly')
            next.setUTCDate(next.getUTCDate() + 7);
        else if (budget.period === 'monthly')
            next.setUTCMonth(next.getUTCMonth() + 1);
        else if (budget.period === 'quarterly')
            next.setUTCMonth(next.getUTCMonth() + 3);
        else
            next.setUTCFullYear(next.getUTCFullYear() + 1);
        if (next > nowDate)
            return { start, end: next };
        start.setTime(next.getTime());
    }
}
export function createDatabaseFinanceRepository(pool) {
    const db = drizzle(pool);
    return {
        async listAccounts(userId) {
            const rows = await db.select().from(accounts).where(and(eq(accounts.userId, userId), eq(accounts.isArchived, false)));
            return rows.map(accountToRow);
        },
        async createAccount(userId, input) {
            const rows = await db.insert(accounts).values({ userId, name: input.name, type: input.type, institution: input.institution, balance: input.balance ?? 0 }).returning();
            return accountToRow(rows[0]);
        },
        async archiveAccount(userId, id) {
            const rows = await db.update(accounts).set({ isArchived: true, updatedAt: new Date() }).where(and(eq(accounts.id, id), eq(accounts.userId, userId))).returning({ id: accounts.id });
            return rows.length > 0;
        },
        async listCategories(userId) {
            const rows = await db.select().from(categories).where(and(eq(categories.isArchived, false), sql `(${categories.userId} IS NULL OR ${categories.userId} = ${userId})`));
            return rows.map(categoryToRow);
        },
        async createCategory(userId, input) {
            const rows = await db.insert(categories).values({ userId, name: input.name, type: input.type, icon: input.icon, color: input.color }).returning();
            return categoryToRow(rows[0]);
        },
        async listTransactions(userId) {
            const rows = await db.select().from(transactions).where(and(eq(transactions.userId, userId), isNull(transactions.deletedAt))).orderBy(desc(transactions.date));
            return rows.map(transactionToRow);
        },
        async createTransaction(userId, input) {
            return db.transaction(async (tx) => {
                const accountRows = await tx.select().from(accounts).where(and(eq(accounts.id, input.accountId), eq(accounts.userId, userId), eq(accounts.isArchived, false))).limit(1);
                const account = accountRows[0];
                if (!account)
                    throw new Error('ACCOUNT_NOT_FOUND');
                if (input.categoryId) {
                    const categoryRows = await tx.select().from(categories).where(and(eq(categories.id, input.categoryId), eq(categories.isArchived, false), sql `(${categories.userId} IS NULL OR ${categories.userId} = ${userId})`)).limit(1);
                    if (!categoryRows[0])
                        throw new Error('CATEGORY_NOT_FOUND');
                }
                const date = input.date ? new Date(input.date) : new Date();
                if (Number.isNaN(date.getTime()))
                    throw new Error('INVALID_DATE');
                if (input.type === 'transfer') {
                    if (!input.toAccountId || input.toAccountId === input.accountId)
                        throw new Error('TARGET_ACCOUNT_REQUIRED');
                    const targetRows = await tx.select().from(accounts).where(and(eq(accounts.id, input.toAccountId), eq(accounts.userId, userId), eq(accounts.isArchived, false))).limit(1);
                    if (!targetRows[0])
                        throw new Error('TARGET_ACCOUNT_REQUIRED');
                    const firstRows = await tx.insert(transactions).values({ userId, accountId: input.accountId, type: 'transfer', amount: input.amount, note: input.note, date, merchant: input.merchant }).returning();
                    const first = firstRows[0];
                    const secondRows = await tx.insert(transactions).values({ userId, accountId: input.toAccountId, type: 'transfer', amount: input.amount, note: input.note, date, merchant: input.merchant, parentId: first.id }).returning();
                    await tx.update(accounts).set({ balance: sql `${accounts.balance} - ${input.amount}`, updatedAt: new Date() }).where(eq(accounts.id, input.accountId));
                    await tx.update(accounts).set({ balance: sql `${accounts.balance} + ${input.amount}`, updatedAt: new Date() }).where(eq(accounts.id, input.toAccountId));
                    return [transactionToRow(first), transactionToRow(secondRows[0])];
                }
                const rows = await tx.insert(transactions).values({ userId, accountId: input.accountId, categoryId: input.categoryId, type: input.type, amount: input.amount, note: input.note, date, merchant: input.merchant }).returning();
                const delta = input.type === 'income' ? input.amount : -input.amount;
                await tx.update(accounts).set({ balance: sql `${accounts.balance} + ${delta}`, updatedAt: new Date() }).where(eq(accounts.id, input.accountId));
                return transactionToRow(rows[0]);
            });
        },
        async deleteTransaction(userId, id) {
            return db.transaction(async (tx) => {
                const rows = await tx.select().from(transactions).where(and(eq(transactions.id, id), eq(transactions.userId, userId), isNull(transactions.deletedAt))).limit(1);
                const row = rows[0];
                if (!row)
                    return false;
                const groupId = row.parentId ?? row.id;
                const group = await tx.select().from(transactions).where(and(eq(transactions.userId, userId), isNull(transactions.deletedAt), sql `(${transactions.id} = ${groupId} OR ${transactions.parentId} = ${groupId})`));
                for (const item of group) {
                    const delta = item.type === 'income' ? -Number(item.amount) : item.type === 'expense' ? Number(item.amount) : (item.id === groupId ? Number(item.amount) : -Number(item.amount));
                    await tx.update(accounts).set({ balance: sql `${accounts.balance} + ${delta}`, updatedAt: new Date() }).where(eq(accounts.id, item.accountId));
                }
                await tx.update(transactions).set({ deletedAt: new Date(), updatedAt: new Date() }).where(and(eq(transactions.userId, userId), isNull(transactions.deletedAt), sql `(${transactions.id} = ${groupId} OR ${transactions.parentId} = ${groupId})`));
                return true;
            });
        },
        async listBudgets(userId) {
            const rows = await db.select().from(budgets).where(eq(budgets.userId, userId));
            return rows.map(budgetToRow);
        },
        async createBudget(userId, input) {
            const startDate = input.startDate ? new Date(input.startDate) : new Date();
            const rows = await db.insert(budgets).values({
                userId,
                categoryId: input.categoryId ?? null,
                name: input.name,
                amount: input.amount,
                period: input.period,
                startDate,
            }).returning();
            return budgetToRow(rows[0]);
        },
        async updateBudget(userId, id, input) {
            const existing = await db.select().from(budgets).where(and(eq(budgets.id, id), eq(budgets.userId, userId))).limit(1);
            if (!existing[0])
                throw new Error('BUDGET_NOT_FOUND');
            const setCols = { updatedAt: new Date() };
            if (input.categoryId !== undefined)
                setCols.categoryId = input.categoryId;
            if (input.name !== undefined)
                setCols.name = input.name;
            if (input.amount !== undefined)
                setCols.amount = input.amount;
            if (input.period !== undefined)
                setCols.period = input.period;
            const updated = await db.update(budgets).set(setCols).where(and(eq(budgets.id, id), eq(budgets.userId, userId))).returning();
            return budgetToRow(updated[0]);
        },
        async deleteBudget(userId, id) {
            const rows = await db.delete(budgets).where(and(eq(budgets.id, id), eq(budgets.userId, userId))).returning({ id: budgets.id });
            return rows.length > 0;
        },
        async getBudgetProgress(userId, id) {
            const budgetRows = await db.select().from(budgets).where(and(eq(budgets.id, id), eq(budgets.userId, userId))).limit(1);
            const budgetRow = budgetRows[0];
            if (!budgetRow)
                throw new Error('BUDGET_NOT_FOUND');
            const { start, end } = dbPeriodBounds(budgetRow);
            const spentRows = await db.select({ amount: transactions.amount }).from(transactions).where(and(eq(transactions.userId, userId), eq(transactions.type, 'expense'), isNull(transactions.deletedAt), budgetRow.categoryId ? eq(transactions.categoryId, budgetRow.categoryId) : sql `1=1`, gte(transactions.date, start), lte(transactions.date, end)));
            const spent = spentRows.reduce((sum, r) => sum + Number(r.amount), 0);
            const budget = budgetToRow(budgetRow);
            return {
                budget,
                spent,
                remaining: Math.max(0, budget.amount - spent),
                percentage: budget.amount === 0 ? 0 : Math.min(100, Math.round((spent / budget.amount) * 100)),
                periodStart: start.toISOString(),
                periodEnd: end.toISOString(),
            };
        },
        async getIdempotency(userId, key) {
            const rows = await db.select().from(idempotencyKeys).where(and(eq(idempotencyKeys.userId, userId), eq(idempotencyKeys.key, key))).limit(1);
            const row = rows[0];
            if (!row || !row.response || !row.statusCode || !row.expiresAt || row.expiresAt <= new Date())
                return null;
            return { response: row.response, statusCode: row.statusCode, expiresAt: row.expiresAt.getTime() };
        },
        async saveIdempotency(userId, key, response, statusCode) {
            await db.insert(idempotencyKeys).values({ userId, key, response, statusCode, expiresAt: new Date(Date.now() + 86_400_000) }).onConflictDoUpdate({ target: [idempotencyKeys.userId, idempotencyKeys.key], set: { response, statusCode, expiresAt: new Date(Date.now() + 86_400_000) } });
        },
        async audit(userId, action, entityType, entityId, changes) {
            await db.insert(auditLog).values({ userId, action, entityType, entityId, changes });
        },
        async listDebts(userId, type) {
            const condition = type
                ? and(eq(debts.userId, userId), eq(debts.type, type))
                : eq(debts.userId, userId);
            const rows = await db.select().from(debts).where(condition).orderBy(desc(debts.createdAt));
            return rows.map(debtToRow);
        },
        async createDebt(userId, input) {
            return db.transaction(async (tx) => {
                let contactId = null;
                if (input.personName) {
                    const contactRows = await tx.select().from(contacts).where(and(eq(contacts.userId, userId), eq(contacts.name, input.personName))).limit(1);
                    if (contactRows[0]) {
                        contactId = contactRows[0].id;
                    }
                    else {
                        const inserted = await tx.insert(contacts).values({ userId, name: input.personName }).returning();
                        contactId = inserted[0].id;
                    }
                }
                const dueDate = input.dueDate ? new Date(input.dueDate) : null;
                const rows = await tx.insert(debts).values({
                    userId,
                    contactId,
                    personName: input.personName,
                    type: input.type,
                    amount: input.amount,
                    remainingAmount: input.remainingAmount ?? input.amount,
                    description: input.description,
                    dueDate,
                }).returning();
                return debtToRow(rows[0]);
            });
        },
        async getDebt(userId, id) {
            const rows = await db.select().from(debts).where(and(eq(debts.id, id), eq(debts.userId, userId))).limit(1);
            return rows[0] ? debtToRow(rows[0]) : null;
        },
        async updateDebt(userId, id, input) {
            const existing = await db.select().from(debts).where(and(eq(debts.id, id), eq(debts.userId, userId))).limit(1);
            if (!existing[0])
                throw new Error('DEBT_NOT_FOUND');
            const setCols = { updatedAt: new Date() };
            if (input.description !== undefined)
                setCols.description = input.description;
            if (input.dueDate !== undefined)
                setCols.dueDate = input.dueDate ? new Date(input.dueDate) : null;
            if (input.status !== undefined)
                setCols.status = input.status;
            const rows = await db.update(debts).set(setCols).where(and(eq(debts.id, id), eq(debts.userId, userId))).returning();
            return debtToRow(rows[0]);
        },
        async deleteDebt(userId, id) {
            const rows = await db.delete(debts).where(and(eq(debts.id, id), eq(debts.userId, userId))).returning({ id: debts.id });
            return rows.length > 0;
        },
        async recordDebtPayment(userId, debtId, input) {
            return db.transaction(async (tx) => {
                const debtRows = await tx.select().from(debts).where(and(eq(debts.id, debtId), eq(debts.userId, userId))).limit(1);
                const debt = debtRows[0];
                if (!debt)
                    throw new Error('DEBT_NOT_FOUND');
                if (debt.status !== 'active')
                    throw new Error('DEBT_NOT_ACTIVE');
                if (input.amount <= 0)
                    throw new Error('INVALID_AMOUNT');
                if (input.amount > Number(debt.remainingAmount))
                    throw new Error('PAYMENT_EXCEEDS_REMAINING');
                const paidAt = input.paidAt ? new Date(input.paidAt) : new Date();
                const paymentRows = await tx.insert(debtPayments).values({
                    userId,
                    debtId,
                    amount: input.amount,
                    note: input.note,
                    paidAt,
                }).returning();
                const newRemaining = Number(debt.remainingAmount) - input.amount;
                const newStatus = newRemaining === 0 ? 'settled' : debt.status;
                const updatedDebtRows = await tx.update(debts).set({
                    remainingAmount: newRemaining,
                    status: newStatus,
                    updatedAt: new Date(),
                }).where(eq(debts.id, debtId)).returning();
                return { payment: debtPaymentToRow(paymentRows[0]), debt: debtToRow(updatedDebtRows[0]) };
            });
        },
        async settleDebt(userId, id) {
            return this.updateDebt(userId, id, { status: 'settled' });
        },
        async getDashboardSummary(userId) {
            const accountRows = await db.select().from(accounts).where(and(eq(accounts.userId, userId), eq(accounts.isArchived, false)));
            const totalBalance = accountRows.reduce((sum, row) => sum + Number(row.balance), 0);
            const nowDate = new Date();
            const monthStartDate = new Date(Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth(), 1));
            const txRows = await db.select().from(transactions).where(and(eq(transactions.userId, userId), isNull(transactions.deletedAt), gte(transactions.date, monthStartDate)));
            const income = txRows.filter((row) => row.type === 'income').reduce((sum, row) => sum + Number(row.amount), 0);
            const expense = txRows.filter((row) => row.type === 'expense').reduce((sum, row) => sum + Number(row.amount), 0);
            return { totalBalance, incomeThisMonth: income, expenseThisMonth: expense, savingsRate: income === 0 ? 0 : Math.round(((income - expense) / income) * 100) };
        },
        async getDashboardCashflow(userId, period = 'daily') {
            const nowDate = new Date();
            const days = period === 'daily' ? 7 : 8;
            const buckets = new Map();
            for (let index = days - 1; index >= 0; index -= 1) {
                const date = new Date(nowDate);
                if (period === 'daily')
                    date.setUTCDate(date.getUTCDate() - index);
                else
                    date.setUTCDate(date.getUTCDate() - (index * 7));
                const label = period === 'daily' ? date.toISOString().slice(0, 10) : date.toISOString().slice(0, 10);
                buckets.set(label, { income: 0, expense: 0 });
            }
            const allTx = await db.select().from(transactions).where(and(eq(transactions.userId, userId), isNull(transactions.deletedAt)));
            for (const row of allTx) {
                const date = new Date(row.date);
                let label;
                if (period === 'daily')
                    label = date.toISOString().slice(0, 10);
                else {
                    const weekStart = new Date(date);
                    weekStart.setUTCDate(date.getUTCDate() - date.getUTCDay());
                    label = weekStart.toISOString().slice(0, 10);
                }
                const bucket = buckets.get(label);
                if (!bucket)
                    continue;
                if (row.type === 'income')
                    bucket.income += Number(row.amount);
                if (row.type === 'expense')
                    bucket.expense += Number(row.amount);
            }
            const breakdown = [...buckets.entries()].map(([label, values]) => ({ ...values, label, net: values.income - values.expense }));
            return {
                period,
                income: breakdown.reduce((sum, row) => sum + row.income, 0),
                expense: breakdown.reduce((sum, row) => sum + row.expense, 0),
                net: breakdown.reduce((sum, row) => sum + row.net, 0),
                breakdown,
            };
        },
        async getDashboardCategories(userId) {
            const nowDate = new Date();
            const monthStartDate = new Date(Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth(), 1));
            const txRows = await db.select().from(transactions).where(and(eq(transactions.userId, userId), eq(transactions.type, 'expense'), isNull(transactions.deletedAt), gte(transactions.date, monthStartDate)));
            const categoryRows = await db.select().from(categories).where(and(eq(categories.isArchived, false), sql `(${categories.userId} IS NULL OR ${categories.userId} = ${userId})`));
            const categoryById = new Map(categoryRows.map((row) => [row.id, row.name]));
            const categoryAmounts = new Map();
            for (const row of txRows) {
                const id = row.categoryId ?? 'uncategorized';
                const name = row.categoryId ? (categoryById.get(row.categoryId) ?? 'Lainnya') : 'Lainnya';
                const existing = categoryAmounts.get(id) ?? { id, name, amount: 0 };
                existing.amount += Number(row.amount);
                categoryAmounts.set(id, existing);
            }
            const total = [...categoryAmounts.values()].reduce((sum, row) => sum + row.amount, 0);
            return {
                total,
                expenses: [...categoryAmounts.values()]
                    .map((row) => ({ ...row, percentage: total === 0 ? 0 : Math.round((row.amount * 100) / total) }))
                    .sort((a, b) => b.amount - a.amount),
            };
        },
        async getDashboardTrends(userId) {
            const nowDate = new Date();
            const months = [];
            for (let index = 5; index >= 0; index -= 1) {
                const date = new Date(Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth() - index, 1));
                const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
                const txRows = await db.select().from(transactions).where(and(eq(transactions.userId, userId), isNull(transactions.deletedAt), gte(transactions.date, date), lt(transactions.date, next)));
                const income = txRows.filter((row) => row.type === 'income').reduce((sum, row) => sum + Number(row.amount), 0);
                const expense = txRows.filter((row) => row.type === 'expense').reduce((sum, row) => sum + Number(row.amount), 0);
                months.push({ month: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`, income, expense, net: income - expense });
            }
            const current = months[months.length - 1];
            const previous = months[months.length - 2];
            return {
                months,
                currentMonth: current.month,
                comparison: {
                    incomeChange: current.income - previous.income,
                    expenseChange: current.expense - previous.expense,
                    netChange: current.net - previous.net,
                },
            };
        },
    };
}
