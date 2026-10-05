/**
 * Reports: summary, category-breakdown, cashflow, export (CSV streaming).
 * No new dependencies — pure in-memory + SQL via the existing pool.
 */
import { Pool } from 'pg';
export type ReportPeriod = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
export interface ReportSummary {
    period: {
        from: string;
        to: string;
        label: string;
    };
    income: number;
    expense: number;
    net: number;
    transactionCount: number;
    topExpenseCategory: string | null;
    topExpenseAmount: number | null;
    savingsRate: number;
}
export interface CategoryBreakdownItem {
    id: string | null;
    name: string;
    type: 'income' | 'expense';
    amount: number;
    percentage: number;
    transactionCount: number;
}
export interface CashflowRow {
    label: string;
    income: number;
    expense: number;
    net: number;
}
export interface CashflowReport {
    period: ReportPeriod;
    totalIncome: number;
    totalExpense: number;
    net: number;
    rows: CashflowRow[];
}
export interface InsightItem {
    kind: 'top_category_change' | 'highest_spend_day' | 'unusual_transaction';
    label: string;
    detail: string;
    amount?: number;
}
export declare function buildReportSummary(pool: Pool, userId: string, period: ReportPeriod): Promise<ReportSummary>;
export declare function buildCategoryBreakdown(pool: Pool, userId: string, period: ReportPeriod): Promise<{
    income: CategoryBreakdownItem[];
    expense: CategoryBreakdownItem[];
    total: {
        income: number;
        expense: number;
    };
}>;
export declare function buildCashflowReport(pool: Pool, userId: string, period: ReportPeriod): Promise<CashflowReport>;
export declare function buildInsights(pool: Pool, userId: string, period: ReportPeriod): Promise<InsightItem[]>;
export declare function streamCsvExport(pool: Pool, userId: string, from: Date, to: Date): AsyncGenerator<string>;
