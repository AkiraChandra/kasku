/**
 * In-memory auth repository for testing.
 * Exposes the same interface as the DB-backed AuthRepository so
 * tests can swap implementations without changing route code.
 */
export interface SessionRow {
  id: string
  userId: string
  tokenHash: string
  expiresAt: Date
  createdAt: Date
}

export interface UserRow {
  id: string
  email: string
  passwordHash: string
  name: string
  externalId: string
  status: string
  createdAt: Date
}

export interface AuthRepository {
  findUserByEmail(email: string): Promise<UserRow | null>
  findUserById(id: string): Promise<UserRow | null>
  createUser(data: { email: string; passwordHash: string; name: string }): Promise<UserRow>
  createSession(data: { userId: string; tokenHash: string; expiresAt: Date }): Promise<SessionRow>
  findSessionByTokenHash(tokenHash: string): Promise<(SessionRow & { user: UserRow }) | null>
  deleteSession(id: string): Promise<void>
  deleteUserSessions(userId: string): Promise<void>
}

// In-memory implementation for tests
const users = new Map<string, UserRow>()
const sessions = new Map<string, SessionRow>()
const sessionsByHash = new Map<string, string>() // tokenHash -> sessionId
const emailIndex = new Map<string, string>() // email -> userId

export const inMemoryAuthRepository: AuthRepository = {
  async findUserByEmail(email: string) {
    const id = emailIndex.get(email.toLowerCase())
    return id ? users.get(id) ?? null : null
  },

  async findUserById(id: string) {
    return users.get(id) ?? null
  },

  async createUser(data) {
    const existing = emailIndex.get(data.email.toLowerCase())
    if (existing) {
      const u = users.get(existing)!
      u.passwordHash = data.passwordHash
      u.name = data.name
      return u
    }
    const id = crypto.randomUUID()
    const user: UserRow = {
      id,
      email: data.email,
      passwordHash: data.passwordHash,
      name: data.name,
      externalId: data.email,
      status: 'active',
      createdAt: new Date(),
    }
    users.set(id, user)
    emailIndex.set(data.email.toLowerCase(), id)
    return user
  },

  async createSession(data) {
    const id = crypto.randomUUID()
    const session: SessionRow = {
      id,
      userId: data.userId,
      tokenHash: data.tokenHash,
      expiresAt: data.expiresAt,
      createdAt: new Date(),
    }
    sessions.set(id, session)
    sessionsByHash.set(data.tokenHash, id)
    return session
  },

  async findSessionByTokenHash(tokenHash) {
    const sessionId = sessionsByHash.get(tokenHash)
    if (!sessionId) return null
    const session = sessions.get(sessionId)
    if (!session || session.expiresAt < new Date()) {
      if (session) {
        sessions.delete(sessionId)
        sessionsByHash.delete(tokenHash)
      }
      return null
    }
    const user = users.get(session.userId)
    if (!user || user.status !== 'active') return null
    return { ...session, user }
  },

  async deleteSession(id: string) {
    const session = sessions.get(id)
    if (session) {
      sessionsByHash.delete(session.tokenHash)
      sessions.delete(id)
    }
  },

  async deleteUserSessions(userId: string) {
    for (const [id, s] of sessions) {
      if (s.userId === userId) {
        sessionsByHash.delete(s.tokenHash)
        sessions.delete(id)
      }
    }
  },
}
