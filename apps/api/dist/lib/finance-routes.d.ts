import { Hono } from 'hono';
import type { AuthRepository } from './auth-repo.js';
import type { FinanceRepository } from './finance-repo.js';
export declare function createFinanceRoutes(financeRepo: FinanceRepository, authRepo?: AuthRepository): Hono<import("hono/types").BlankEnv, import("hono/types").BlankSchema, "/">;
