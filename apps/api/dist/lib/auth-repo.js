// In-memory implementation for tests
const users = new Map();
const sessions = new Map();
const sessionsByHash = new Map(); // tokenHash -> sessionId
const emailIndex = new Map(); // email -> userId
export const inMemoryAuthRepository = {
    async findUserByEmail(email) {
        const id = emailIndex.get(email.toLowerCase());
        return id ? users.get(id) ?? null : null;
    },
    async findUserById(id) {
        return users.get(id) ?? null;
    },
    async createUser(data) {
        const existing = emailIndex.get(data.email.toLowerCase());
        if (existing) {
            const u = users.get(existing);
            u.passwordHash = data.passwordHash;
            u.name = data.name;
            return u;
        }
        const id = crypto.randomUUID();
        const user = {
            id,
            email: data.email,
            passwordHash: data.passwordHash,
            name: data.name,
            externalId: data.email,
            status: 'active',
            createdAt: new Date(),
        };
        users.set(id, user);
        emailIndex.set(data.email.toLowerCase(), id);
        return user;
    },
    async createSession(data) {
        const id = crypto.randomUUID();
        const session = {
            id,
            userId: data.userId,
            tokenHash: data.tokenHash,
            expiresAt: data.expiresAt,
            createdAt: new Date(),
        };
        sessions.set(id, session);
        sessionsByHash.set(data.tokenHash, id);
        return session;
    },
    async findSessionByTokenHash(tokenHash) {
        const sessionId = sessionsByHash.get(tokenHash);
        if (!sessionId)
            return null;
        const session = sessions.get(sessionId);
        if (!session || session.expiresAt < new Date()) {
            if (session) {
                sessions.delete(sessionId);
                sessionsByHash.delete(tokenHash);
            }
            return null;
        }
        const user = users.get(session.userId);
        if (!user || user.status !== 'active')
            return null;
        return { ...session, user };
    },
    async deleteSession(id) {
        const session = sessions.get(id);
        if (session) {
            sessionsByHash.delete(session.tokenHash);
            sessions.delete(id);
        }
    },
    async deleteUserSessions(userId) {
        for (const [id, s] of sessions) {
            if (s.userId === userId) {
                sessionsByHash.delete(s.tokenHash);
                sessions.delete(id);
            }
        }
    },
};
