import type { Pool } from 'pg';
export type BillAmountType = 'fixed' | 'variable';
export type BillRecurrence = 'weekly' | 'monthly' | 'quarterly' | 'yearly';
export type BillStatus = 'upcoming' | 'due' | 'overdue' | 'paid' | 'skipped';
export type BillRow = {
    id: string;
    userId: string;
    name: string;
    categoryId: string | null;
    accountId: string | null;
    amountType: BillAmountType;
    amount: number;
    recurrence: BillRecurrence;
    dueDay: number | null;
    reminderDaysBefore: number[];
    isActive: boolean;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
};
export type BillOccurrenceRow = {
    id: string;
    userId: string;
    billId: string;
    dueDate: string;
    expectedAmount: number;
    status: BillStatus;
    transactionId: string | null;
    paidDate: string | null;
    createdAt: string;
    billName?: string;
    billAmount?: number;
    billCategoryId?: string | null;
    billAccountId?: string | null;
};
export type CreateBillInput = {
    name: string;
    categoryId?: string;
    accountId?: string;
    amountType?: BillAmountType;
    amount: number;
    recurrence: BillRecurrence;
    dueDay?: number;
    reminderDaysBefore?: number[];
    notes?: string;
};
export type UpdateBillInput = {
    name?: string;
    categoryId?: string | null;
    accountId?: string | null;
    amountType?: BillAmountType;
    amount?: number;
    recurrence?: BillRecurrence;
    dueDay?: number | null;
    reminderDaysBefore?: number[];
    isActive?: boolean;
    notes?: string | null;
};
export type MarkOccurrenceInput = {
    transactionId?: string;
    paidDate?: string;
};
export interface BillsRepository {
    reset?(): void;
    listBills(userId: string): Promise<BillRow[]>;
    createBill(userId: string, input: CreateBillInput): Promise<BillRow>;
    getBill(userId: string, id: string): Promise<BillRow | null>;
    updateBill(userId: string, id: string, input: UpdateBillInput): Promise<BillRow>;
    deleteBill(userId: string, id: string): Promise<boolean>;
    listOccurrences(userId: string, billId: string): Promise<BillOccurrenceRow[]>;
    generateOccurrences(userId: string, billId: string, days?: number): Promise<BillOccurrenceRow[]>;
    getUpcoming(userId: string, days: number): Promise<BillOccurrenceRow[]>;
    markPaid(userId: string, billId: string, occurrenceId: string, input?: MarkOccurrenceInput): Promise<BillOccurrenceRow>;
    markSkipped(userId: string, billId: string, occurrenceId: string): Promise<BillOccurrenceRow>;
}
export declare const inMemoryBillsRepository: BillsRepository;
export declare function createDatabaseBillsRepository(pool: Pool): BillsRepository;
