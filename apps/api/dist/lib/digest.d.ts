/**
 * Digest: weekly and monthly summaries with text field ready for WhatsApp.
 * Indonesian text, formatted numbers, insight highlights.
 */
import { Pool } from 'pg';
export interface DigestResult {
    period: {
        from: string;
        to: string;
        label: string;
    };
    income: number;
    expense: number;
    net: number;
    savingsRate: number;
    transactionCount: number;
    topCategories: Array<{
        name: string;
        amount: number;
        percentage: number;
    }>;
    insights: Array<{
        kind: string;
        label: string;
        detail: string;
        amount?: number;
    }>;
    budgets: Array<{
        name: string;
        spent: number;
        budget: number;
        percentage: number;
    }>;
    text: string;
}
export declare function buildDigest(pool: Pool, userId: string, period: 'weekly' | 'monthly'): Promise<DigestResult>;
