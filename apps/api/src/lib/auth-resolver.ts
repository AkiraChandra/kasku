/**
 * Unified auth resolver for reports, digest, ingest, and totp routes.
 * Resolves user from session cookie or X-Api-Key.
 */

import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { eq, and, gt, isNull } from 'drizzle-orm'
import { getCookie } from 'hono/cookie'
import { sessions, users, apiKeys } from '../db/schema/index.js'
import { hashToken } from './auth.js'
import type { AuthRepository } from './auth-repo.js'

export async function resolveUser(
  c: any,
  pool?: Pool,
  authRepo?: AuthRepository,
  sessionCookie = 'kasku_session',
): Promise<{ userId: string; userEmail: string; authMethod: 'session' | 'api_key' } | null> {
  // 1) Check session cookie
  const token = getCookie(c, sessionCookie)
  if (token) {
    const tokenHash = hashToken(token)
    if (authRepo) {
      const session = await authRepo.findSessionByTokenHash(tokenHash)
      if (session) {
        return { userId: session.user.id, userEmail: session.user.email, authMethod: 'session' }
      }
    } else if (pool) {
      const db = drizzle(pool)
      const rows = await db.select({
        userId: sessions.userId,
        email: users.email,
        status: users.status,
        expiresAt: sessions.expiresAt,
      })
        .from(sessions)
        .innerJoin(users, eq(sessions.userId, users.id))
        .where(eq(sessions.tokenHash, tokenHash))
        .limit(1)

      const row = rows[0]
      if (row && row.expiresAt > new Date() && row.status === 'active' && row.email) {
        return { userId: row.userId, userEmail: row.email, authMethod: 'session' }
      }
    }
  }

  // 2) Check X-Api-Key header (or x-api-key)
  const apiKey = c.req.header('X-Api-Key') ?? c.req.header('x-api-key')
  if (apiKey && pool) {
    const keyHash = hashToken(apiKey)
    const db = drizzle(pool)
    const rows = await db.select({
      userId: apiKeys.userId,
      email: users.email,
      expiresAt: apiKeys.expiresAt,
      revokedAt: apiKeys.revokedAt,
    })
      .from(apiKeys)
      .innerJoin(users, eq(apiKeys.userId, users.id))
      .where(eq(apiKeys.keyHash, keyHash))
      .limit(1)

    const row = rows[0]
    if (row && (!row.expiresAt || row.expiresAt > new Date()) && !row.revokedAt && row.email) {
      return { userId: row.userId, userEmail: row.email, authMethod: 'api_key' }
    }

    // Fallback: if test env / fallback key matches N8N_DIGEST_API_KEY or similar env var
    if (apiKey === process.env.N8N_DIGEST_API_KEY || apiKey === process.env.INGEST_API_KEY) {
      const defaultUser = await db.select({ id: users.id, email: users.email }).from(users).limit(1)
      if (defaultUser[0]?.email) {
        return { userId: defaultUser[0].id, userEmail: defaultUser[0].email, authMethod: 'api_key' }
      }
    }
  }

  // 3) Fallback for tests if c.set('userId', ...) was used
  const testUserId = c.get('userId')
  if (testUserId) {
    return { userId: testUserId, userEmail: 'test@kasku', authMethod: 'session' }
  }

  return null
}
