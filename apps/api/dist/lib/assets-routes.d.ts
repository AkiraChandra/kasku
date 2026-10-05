import { Hono } from 'hono';
import type { AuthRepository } from './auth-repo.js';
import type { AssetsRepository } from './assets-repo.js';
export declare function createAssetsRoutes(assetsRepo: AssetsRepository, authRepo?: AuthRepository): Hono<import("hono/types").BlankEnv, import("hono/types").BlankSchema, "/">;
