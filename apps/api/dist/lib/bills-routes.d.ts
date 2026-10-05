import { Hono } from 'hono';
import type { AuthRepository } from './auth-repo.js';
import type { BillsRepository } from './bills-repo.js';
export declare function createBillsRoutes(billsRepo: BillsRepository, authRepo?: AuthRepository): Hono<import("hono/types").BlankEnv, import("hono/types").BlankSchema, "/">;
