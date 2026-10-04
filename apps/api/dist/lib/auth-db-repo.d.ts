import type { Pool } from 'pg';
import type { AuthRepository } from './auth-repo.js';
export declare function createDatabaseAuthRepository(pool: Pool): AuthRepository;
