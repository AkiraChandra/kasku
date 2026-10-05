import { Hono } from 'hono';
import { Pool } from 'pg';
import type { AuthRepository } from './lib/auth-repo.js';
import type { FinanceRepository } from './lib/finance-repo.js';
export type ApiSuccess<T> = {
    ok: true;
    data: T;
    summary_text?: string;
};
export type ApiFailure = {
    ok: false;
    error: {
        code: string;
        message: string;
        field?: string;
        options?: string[];
    };
};
export declare const success: <T>(data: T, summary_text?: string) => ApiSuccess<T>;
export declare const failure: (code: string, message: string, field?: string, options?: string[]) => ApiFailure;
type Dependencies = {
    checkDatabase?: () => Promise<'ok' | 'error'>;
    pool?: Pool;
    authRepo?: AuthRepository;
    financeRepo?: FinanceRepository;
    billsRepo?: import('./lib/bills-repo.js').BillsRepository;
    assetsRepo?: import('./lib/assets-repo.js').AssetsRepository;
};
export declare function createApp(dependencies?: Dependencies): Hono<import("hono/types").BlankEnv, import("hono/types").BlankSchema, "/">;
export declare const app: Hono<import("hono/types").BlankEnv, import("hono/types").BlankSchema, "/">;
export default app;
