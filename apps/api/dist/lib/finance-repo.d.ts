import type { Pool } from 'pg';
export type AccountType = 'cash' | 'bank' | 'ewallet' | 'credit_card' | 'investment' | 'other';
export type FinanceTransactionType = 'income' | 'expense' | 'transfer';
export type AccountRow = {
    id: string;
    userId: string;
    name: string;
    type: string;
    institution?: string | null;
    balance: number;
    currency: string;
    isArchived: boolean;
    createdAt: string;
    updatedAt: string;
};
export type CategoryRow = {
    id: string;
    userId: string | null;
    name: string;
    type: string;
    icon?: string | null;
    color?: string | null;
    isArchived: boolean;
    createdAt: string;
};
export type TransactionRow = {
    id: string;
    userId: string;
    accountId: string;
    categoryId: string | null;
    type: FinanceTransactionType;
    amount: number;
    note: string | null;
    date: string;
    merchant: string | null;
    parentId: string | null;
    deletedAt: string | null;
    createdAt: string;
};
export type CreateTransactionInput = {
    accountId: string;
    toAccountId?: string;
    categoryId?: string;
    type: FinanceTransactionType;
    amount: number;
    note?: string;
    date?: string;
    merchant?: string;
};
export type IdempotencyRow = {
    response: unknown;
    statusCode: number;
    expiresAt: number;
};
export type BudgetPeriod = 'weekly' | 'monthly' | 'quarterly' | 'yearly';
export type BudgetRow = {
    id: string;
    userId: string;
    categoryId: string | null;
    name: string;
    amount: number;
    period: BudgetPeriod;
    startDate: string;
    createdAt: string;
    updatedAt: string;
};
export type BudgetProgressRow = {
    budget: BudgetRow;
    spent: number;
    remaining: number;
    percentage: number;
    periodStart: string;
    periodEnd: string;
};
export type CreateBudgetInput = {
    categoryId?: string;
    name: string;
    amount: number;
    period: BudgetPeriod;
    startDate?: string;
};
export type UpdateBudgetInput = {
    categoryId?: string | null;
    name?: string;
    amount?: number;
    period?: BudgetPeriod;
};
export type DebtType = 'lent_out' | 'borrowed';
export type DebtStatus = 'active' | 'settled' | 'cancelled';
export type DebtRow = {
    id: string;
    userId: string;
    contactId: string | null;
    personName: string | null;
    type: DebtType;
    amount: number;
    remainingAmount: number;
    currency: string;
    description: string | null;
    dueDate: string | null;
    status: DebtStatus;
    createdAt: string;
    updatedAt: string;
};
export type DebtPaymentRow = {
    id: string;
    userId: string;
    debtId: string;
    amount: number;
    note: string | null;
    paidAt: string;
    createdAt: string;
};
export type CreateDebtInput = {
    type: DebtType;
    personName: string;
    amount: number;
    remainingAmount?: number;
    description?: string;
    dueDate?: string;
};
export type UpdateDebtInput = {
    description?: string;
    dueDate?: string | null;
    status?: DebtStatus;
};
export type RecordPaymentInput = {
    amount: number;
    note?: string;
    paidAt?: string;
};
export type DashboardSummary = {
    totalBalance: number;
    incomeThisMonth: number;
    expenseThisMonth: number;
    savingsRate: number;
};
export type DashboardCashflow = {
    period: 'daily' | 'weekly';
    income: number;
    expense: number;
    net: number;
    breakdown: Array<{
        label: string;
        income: number;
        expense: number;
        net: number;
    }>;
};
export type DashboardCategories = {
    expenses: Array<{
        id: string;
        name: string;
        amount: number;
        percentage: number;
    }>;
    total: number;
};
export type DashboardTrends = {
    months: Array<{
        month: string;
        income: number;
        expense: number;
        net: number;
    }>;
    comparison: {
        incomeChange: number;
        expenseChange: number;
        netChange: number;
    };
    currentMonth: string;
};
export interface FinanceRepository {
    reset?(): void;
    listAccounts(userId: string): Promise<AccountRow[]>;
    createAccount(userId: string, input: {
        name: string;
        type: string;
        institution?: string;
        balance?: number;
    }): Promise<AccountRow>;
    archiveAccount(userId: string, id: string): Promise<boolean>;
    listCategories(userId: string): Promise<CategoryRow[]>;
    createCategory(userId: string, input: {
        name: string;
        type: string;
        icon?: string;
        color?: string;
    }): Promise<CategoryRow>;
    listTransactions(userId: string): Promise<TransactionRow[]>;
    createTransaction(userId: string, input: CreateTransactionInput): Promise<TransactionRow | TransactionRow[]>;
    deleteTransaction(userId: string, id: string): Promise<boolean>;
    listBudgets(userId: string): Promise<BudgetRow[]>;
    createBudget(userId: string, input: CreateBudgetInput): Promise<BudgetRow>;
    updateBudget(userId: string, id: string, input: UpdateBudgetInput): Promise<BudgetRow>;
    deleteBudget(userId: string, id: string): Promise<boolean>;
    getBudgetProgress(userId: string, id: string): Promise<BudgetProgressRow>;
    listDebts(userId: string, type?: DebtType): Promise<DebtRow[]>;
    createDebt(userId: string, input: CreateDebtInput): Promise<DebtRow>;
    getDebt(userId: string, id: string): Promise<DebtRow | null>;
    updateDebt(userId: string, id: string, input: UpdateDebtInput): Promise<DebtRow>;
    deleteDebt(userId: string, id: string): Promise<boolean>;
    recordDebtPayment(userId: string, debtId: string, input: RecordPaymentInput): Promise<{
        payment: DebtPaymentRow;
        debt: DebtRow;
    }>;
    settleDebt(userId: string, id: string): Promise<DebtRow>;
    getDashboardSummary(userId: string): Promise<DashboardSummary>;
    getDashboardCashflow(userId: string, period?: 'daily' | 'weekly'): Promise<DashboardCashflow>;
    getDashboardCategories(userId: string): Promise<DashboardCategories>;
    getDashboardTrends(userId: string): Promise<DashboardTrends>;
    getIdempotency(userId: string, key: string): Promise<IdempotencyRow | null>;
    saveIdempotency(userId: string, key: string, response: unknown, statusCode: number): Promise<void>;
    audit(userId: string, action: string, entityType: string, entityId: string | null, changes?: unknown): Promise<void>;
}
export declare const inMemoryFinanceRepository: FinanceRepository;
export declare function createDatabaseFinanceRepository(pool: Pool): FinanceRepository;
