/**
 * In-memory auth repository for testing.
 * Exposes the same interface as the DB-backed AuthRepository so
 * tests can swap implementations without changing route code.
 */
export interface SessionRow {
    id: string;
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    createdAt: Date;
}
export interface UserRow {
    id: string;
    email: string;
    passwordHash: string;
    name: string;
    externalId: string;
    status: string;
    createdAt: Date;
}
export interface AuthRepository {
    findUserByEmail(email: string): Promise<UserRow | null>;
    findUserById(id: string): Promise<UserRow | null>;
    createUser(data: {
        email: string;
        passwordHash: string;
        name: string;
    }): Promise<UserRow>;
    createSession(data: {
        userId: string;
        tokenHash: string;
        expiresAt: Date;
    }): Promise<SessionRow>;
    findSessionByTokenHash(tokenHash: string): Promise<(SessionRow & {
        user: UserRow;
    }) | null>;
    deleteSession(id: string): Promise<void>;
    deleteUserSessions(userId: string): Promise<void>;
}
export declare const inMemoryAuthRepository: AuthRepository;
