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
    getIdempotency(userId: string, key: string): Promise<IdempotencyRow | null>;
    saveIdempotency(userId: string, key: string, response: unknown, statusCode: number): Promise<void>;
    audit(userId: string, action: string, entityType: string, entityId: string | null, changes?: unknown): Promise<void>;
}
export declare const inMemoryFinanceRepository: FinanceRepository;
export declare function createDatabaseFinanceRepository(pool: Pool): FinanceRepository;
