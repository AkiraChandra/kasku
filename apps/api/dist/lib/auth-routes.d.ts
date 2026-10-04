import { Hono } from 'hono';
import type { AuthRepository } from './auth-repo.js';
export declare function createAuthRoutes(repo: AuthRepository, secure: boolean): Hono<import("hono/types").BlankEnv, import("hono/types").BlankSchema, "/">;
