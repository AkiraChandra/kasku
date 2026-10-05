/**
 * Digest API routes.
 * GET /digest/weekly, /digest/monthly
 */

import { Hono } from 'hono'
import { Pool } from 'pg'
import { failure, success } from '../index.js'
import { checkRateLimit, API_RATE_LIMIT } from './rate-limit.js'
import { buildDigest } from './digest.js'
import { resolveUser } from './auth-resolver.js'
import type { AuthRepository } from './auth-repo.js'

export function createDigestRoutes(
  pool: Pool,
  authRepo?: AuthRepository,
  sessionCookie = 'kasku_session',
) {
  const app = new Hono()

  function rateLimit(c: any): Response | null {
    const ip = c.req.header('x-forwarded-for') ?? c.req.header('cf-connecting-ip') ?? 'anon'
    const result = checkRateLimit(`digest:${ip}`, API_RATE_LIMIT)
    if (!result.allowed) {
      return c.json(failure('RATE_LIMITED', 'Terlalu banyak permintaan'), 429)
    }
    return null
  }

  async function authenticate(c: any): Promise<string | Response> {
    const user = await resolveUser(c, pool, authRepo, sessionCookie)
    if (!user) {
      return c.json(failure('UNAUTHORIZED', 'Sesi tidak ditemukan, silakan login'), 401)
    }
    return user.userId
  }

  // GET /digest/weekly
  app.get('/weekly', async (c) => {
    const blocked = rateLimit(c)
    if (blocked) return blocked

    const userId = await authenticate(c)
    if (userId instanceof Response) return userId

    const digest = await buildDigest(pool, userId, 'weekly')
    return c.json(success(digest, digest.text))
  })

  // GET /digest/monthly
  app.get('/monthly', async (c) => {
    const blocked = rateLimit(c)
    if (blocked) return blocked

    const userId = await authenticate(c)
    if (userId instanceof Response) return userId

    const digest = await buildDigest(pool, userId, 'monthly')
    return c.json(success(digest, digest.text))
  })

  return app
}
