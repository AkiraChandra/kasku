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

export type ResolvedUser = {
  userId: string
  userEmail: string
  authMethod: 'session' | 'api_key'
  scopes?: string[] | null
}

export function hasApiScope(
  apiKey: { scopes?: string[] | null } | string[] | null | undefined,
  requiredScope: string,
): boolean {
  const scopes = Array.isArray(apiKey) ? apiKey : apiKey?.scopes
  return scopes?.includes(requiredScope) ?? false
}

export function isAuthorizedForScope(
  apiKey: { authMethod?: 'session' | 'api_key'; scopes?: string[] | null },
  requiredScope: string,
): boolean {
  return apiKey.authMethod === 'session' || hasApiScope(apiKey, requiredScope)
}

export async function resolveUser(
  c: any,
  pool?: Pool,
  authRepo?: AuthRepository,
  sessionCookie = 'kasku_session',
): Promise<ResolvedUser | null> {
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
      scopes: apiKeys.scopes,
    })
      .from(apiKeys)
      .innerJoin(users, eq(apiKeys.userId, users.id))
      .where(eq(apiKeys.keyHash, keyHash))
      .limit(1)

    const row = rows[0]
    if (row && (!row.expiresAt || row.expiresAt > new Date()) && !row.revokedAt && row.email) {
      return { userId: row.userId, userEmail: row.email, authMethod: 'api_key', scopes: row.scopes }
    }

    // Fallback keys are route-specific; never grant a broad API-key scope.
    if (apiKey === process.env.INGEST_API_KEY || apiKey === process.env.N8N_DIGEST_API_KEY) {
      const defaultUser = await db.select({ id: users.id, email: users.email }).from(users).limit(1)
      if (defaultUser[0]?.email) {
        return {
          userId: defaultUser[0].id,
          userEmail: defaultUser[0].email,
          authMethod: 'api_key',
          scopes: apiKey === process.env.INGEST_API_KEY ? ['ingest:w'] : ['digest:r'],
        }
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
