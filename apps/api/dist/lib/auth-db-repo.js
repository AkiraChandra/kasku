import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sessions, users } from '../db/schema/index.js';
function toUser(row) {
    if (!row.email || !row.passwordHash || !row.name)
        return null;
    return {
        id: row.id,
        email: row.email,
        passwordHash: row.passwordHash,
        name: row.name,
        externalId: row.externalId,
        status: row.status ?? 'active',
        createdAt: row.createdAt ?? new Date(0),
    };
}
function toSession(row) {
    return {
        id: row.id,
        userId: row.userId,
        tokenHash: row.tokenHash,
        expiresAt: row.expiresAt,
        createdAt: row.createdAt ?? new Date(0),
    };
}
export function createDatabaseAuthRepository(pool) {
    const db = drizzle(pool);
    return {
        async findUserByEmail(email) {
            const rows = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
            return rows[0] ? toUser(rows[0]) : null;
        },
        async findUserById(id) {
            const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
            return rows[0] ? toUser(rows[0]) : null;
        },
        async createUser(data) {
            const rows = await db.insert(users).values({
                externalId: data.email,
                email: data.email.toLowerCase(),
                passwordHash: data.passwordHash,
                name: data.name,
                displayName: data.name,
            }).onConflictDoUpdate({
                target: users.email,
                set: { passwordHash: data.passwordHash, name: data.name, displayName: data.name },
            }).returning();
            const user = rows[0] && toUser(rows[0]);
            if (!user)
                throw new Error('User could not be created');
            return user;
        },
        async createSession(data) {
            const rows = await db.insert(sessions).values(data).returning();
            return toSession(rows[0]);
        },
        async findSessionByTokenHash(tokenHash) {
            const rows = await db.select({ session: sessions, user: users })
                .from(sessions)
                .innerJoin(users, eq(sessions.userId, users.id))
                .where(eq(sessions.tokenHash, tokenHash))
                .limit(1);
            const row = rows[0];
            if (!row)
                return null;
            const session = toSession(row.session);
            const user = toUser(row.user);
            if (!user || session.expiresAt <= new Date() || user.status !== 'active')
                return null;
            return { ...session, user };
        },
        async deleteSession(id) {
            await db.delete(sessions).where(eq(sessions.id, id));
        },
        async deleteUserSessions(userId) {
            await db.delete(sessions).where(eq(sessions.userId, userId));
        },
    };
}
