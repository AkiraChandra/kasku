import { Hono } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { z } from 'zod'
import { failure, success } from '../index.js'
import type { AuthRepository } from './auth-repo.js'
import { hashPassword, verifyPassword, generateSessionToken, hashToken } from './auth.js'

const SESSION_COOKIE = 'kasku_session'
const SESSION_TTL_DAYS = 30

const loginSchema = z.object({
  email: z.string().email('Format email tidak valid'),
  password: z.string().min(1, 'Password wajib diisi'),
})

export function createAuthRoutes(repo: AuthRepository, secure: boolean) {
  const app = new Hono()
  // Rate limit: 5 requests per IP per 60s (in-process Map, reset after window)
  const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
  const checkRateLimit = (ip: string, limit = 5, windowMs = 60_000): boolean => {
    const now = Date.now()
    const entry = rateLimitMap.get(ip)
    if (!entry || entry.resetAt < now) {
      rateLimitMap.set(ip, { count: 1, resetAt: now + windowMs })
      return true
    }
    if (entry.count >= limit) return false
    entry.count++
    return true
  }

  // POST /api/v1/auth/login
  app.post('/login', async (c) => {
    const ip = c.req.header('x-forwarded-for') ?? c.req.header('cf-connecting-ip') ?? 'unknown'
    if (!checkRateLimit(ip)) {
      return c.json(failure('RATE_LIMITED', 'Terlalu banyak percobaan login, coba lagi nanti'), 429)
    }

    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json(failure('INVALID_REQUEST', 'JSON request tidak valid'), 400)
    }

    const parsed = loginSchema.safeParse(body)
    if (!parsed.success) {
      const err = parsed.error.errors[0]
      return c.json(failure('VALIDATION_ERROR', err.message, err.path.join('.')), 400)
    }

    const { email, password } = parsed.data
    const user = await repo.findUserByEmail(email.toLowerCase())
    if (!user) {
      return c.json(failure('INVALID_CREDENTIALS', 'Email atau password salah'), 401)
    }

    const valid = await verifyPassword(user.passwordHash, password)
    if (!valid) {
      return c.json(failure('INVALID_CREDENTIALS', 'Email atau password salah'), 401)
    }

    if (user.status !== 'active') {
      return c.json(failure('ACCOUNT_INACTIVE', 'Akun tidak aktif'), 403)
    }

    // Delete old sessions
    await repo.deleteUserSessions(user.id)

    const token = generateSessionToken()
    const tokenHash = hashToken(token)
    const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000)
    await repo.createSession({ userId: user.id, tokenHash, expiresAt })

    setCookie(c, SESSION_COOKIE, token, {
      httpOnly: true,
      secure,
      sameSite: 'Lax',
      path: '/',
      expires: expiresAt,
    })

    return c.json(success({ userId: user.id, email: user.email, name: user.name }))
  })

  // GET /api/v1/auth/me
  app.get('/me', async (c) => {
    const token = getCookie(c, SESSION_COOKIE)
    if (!token) {
      return c.json(failure('UNAUTHORIZED', 'Sesi tidak ditemukan, silakan login'), 401)
    }

    const tokenHash = hashToken(token)
    const session = await repo.findSessionByTokenHash(tokenHash)
    if (!session) {
      deleteCookie(c, SESSION_COOKIE, { path: '/' })
      return c.json(failure('SESSION_EXPIRED', 'Sesi telah berakhir, silakan login ulang'), 401)
    }

    return c.json(success({
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      externalId: session.user.externalId,
    }))
  })

  // POST /api/v1/auth/logout
  app.post('/logout', async (c) => {
    const token = getCookie(c, SESSION_COOKIE)
    if (token) {
      const tokenHash = hashToken(token)
      const session = await repo.findSessionByTokenHash(tokenHash)
      if (session) {
        await repo.deleteSession(session.id)
      }
      deleteCookie(c, SESSION_COOKIE, { path: '/' })
    }
    return c.json(success({ message: 'Berhasil logout' }))
  })

  return app
}
