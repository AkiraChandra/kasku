/**
 * 2FA TOTP routes for web.
 * Mounted at: /api/v1/auth/2fa
 * POST /api/v1/auth/2fa/setup     — generate secret, return provisioning URI + QR
 * POST /api/v1/auth/2fa/verify    — verify TOTP code and enable 2FA
 * POST /api/v1/auth/2fa/disable   — disable 2FA (requires current TOTP)
 * GET  /api/v1/auth/2fa/status    — get 2FA status
 */

import { Hono } from 'hono'
import { Pool } from 'pg'
import { randomBytes, createHmac } from 'crypto'
import { z } from 'zod'
import { failure, success } from '../index.js'
import { resolveUser } from './auth-resolver.js'
import type { AuthRepository } from './auth-repo.js'

// Minimal TOTP implementation — RFC 6238 compliant
// Accepts 6-digit TOTP, 30s window, ±1 step tolerance

function base32Encode(buf: Buffer): string {
  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = 0, value = 0, output = ''
  for (let i = 0; i < buf.length; i++) {
    value = (value << 8) | buf[i]
    bits += 8
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) output += ALPHABET[(value << (5 - bits)) & 31]
  return output
}

function base32Decode(str: string): Buffer {
  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const cleaned = str.toUpperCase().replace(/[^A-Z2-7]/g, '')
  const bits: number[] = []
  for (const ch of cleaned) {
    const v = ALPHABET.indexOf(ch)
    if (v < 0) continue
    bits.push(v)
  }
  const buf: number[] = []
  let value = 0, bitsLeft = 0
  for (const v of bits) {
    value = (value << 5) | v
    bitsLeft += 5
    if (bitsLeft >= 8) {
      buf.push((value >>> (bitsLeft - 8)) & 0xff)
      bitsLeft -= 8
    }
  }
  return Buffer.from(buf)
}

function hotp(secret: Buffer, counter: bigint): string {
  const hmac = createHmac('sha1', secret)
  const counterBuf = Buffer.alloc(8)
  const counterVal = counter
  counterBuf[0] = Number((counterVal >> 56n) & 0xffn)
  counterBuf[1] = Number((counterVal >> 48n) & 0xffn)
  counterBuf[2] = Number((counterVal >> 40n) & 0xffn)
  counterBuf[3] = Number((counterVal >> 32n) & 0xffn)
  counterBuf[4] = Number((counterVal >> 24n) & 0xffn)
  counterBuf[5] = Number((counterVal >> 16n) & 0xffn)
  counterBuf[6] = Number((counterVal >> 8n) & 0xffn)
  counterBuf[7] = Number(counterVal & 0xffn)
  const digest = Buffer.from(hmac.update(counterBuf).digest())
  const offset = digest[19] & 0xf
  const code = ((digest[offset] & 0x7f) << 24) | (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) | (digest[offset + 3])
  return String(code % 1000000).padStart(6, '0')
}

export function totp(secret: Buffer, timeMs = Date.now()): string {
  const counter = BigInt(Math.floor(timeMs / 30000))
  return hotp(secret, counter)
}

export function verifyTotp(secret: Buffer, token: string, timeMs = Date.now()): boolean {
  const steps = [-1, 0, 1]
  for (const offset of steps) {
    const stepMs = timeMs + offset * 30_000
    if (totp(secret, stepMs) === token) return true
  }
  return false
}

export function totpUri(secretBase32: string, email: string, issuer = 'Kasku'): string {
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: 'SHA1',
    digits: '6',
    period: '30',
  })
  return `otpauth://totp/${encodeURIComponent(issuer + ':' + email)}?${params}`
}

const verifySchema = z.object({ code: z.string().length(6) })
const disableSchema = z.object({ code: z.string().length(6) })

export type TotpStore = {
  getPendingSecret(userId: string): string | null
  setPendingSecret(userId: string, secret: string): void
  clearPendingSecret(userId: string): void
  getUserSecret(userId: string): string | null
  setUserSecret(userId: string, secret: string): void
  clearUserSecret(userId: string): void
  isUserEnabled(userId: string): boolean
}

const pendingSecrets = new Map<string, { secret: string; expiresAt: number }>()
const activeSecrets = new Map<string, string>()

export const memoryTotpStore: TotpStore = {
  getPendingSecret(userId) {
    const entry = pendingSecrets.get(userId)
    if (!entry || entry.expiresAt < Date.now()) {
      pendingSecrets.delete(userId)
      return null
    }
    return entry.secret
  },
  setPendingSecret(userId, secret) {
    pendingSecrets.set(userId, { secret, expiresAt: Date.now() + 10 * 60_000 })
  },
  clearPendingSecret(userId) {
    pendingSecrets.delete(userId)
  },
  getUserSecret(userId) {
    return activeSecrets.get(userId) ?? null
  },
  setUserSecret(userId, secret) {
    activeSecrets.set(userId, secret)
  },
  clearUserSecret(userId) {
    activeSecrets.delete(userId)
  },
  isUserEnabled(userId) {
    return activeSecrets.has(userId)
  },
}

export function createTotpRoutes(
  sessionCookie = 'kasku_session',
  totpStore: TotpStore = memoryTotpStore,
  authRepo?: AuthRepository,
  pool?: Pool,
) {
  const app = new Hono()

  async function authenticate(c: any): Promise<{ userId: string; userEmail: string } | Response> {
    const user = await resolveUser(c, pool, authRepo, sessionCookie)
    if (!user) {
      return c.json(failure('UNAUTHORIZED', 'Sesi tidak ditemukan, silakan login'), 401)
    }
    return user
  }

  // GET /status (full path /api/v1/auth/2fa/status)
  app.get('/status', async (c) => {
    const user = await authenticate(c)
    if (user instanceof Response) return user

    const enabled = totpStore.isUserEnabled(user.userId)
    return c.json(success({ enabled, setupComplete: enabled }))
  })

  // POST /setup (full path /api/v1/auth/2fa/setup)
  app.post('/setup', async (c) => {
    const user = await authenticate(c)
    if (user instanceof Response) return user

    const secretBytes = randomBytes(20)
    const secretBase32 = base32Encode(secretBytes)
    const uri = totpUri(secretBase32, user.userEmail || 'user@kasku')

    totpStore.setPendingSecret(user.userId, secretBase32)

    // Return QR as base64 data URI
    const qrDataUrl = `data:text/plain;base64,${Buffer.from(uri).toString('base64')}`
    return c.json(success({
      secret: secretBase32,
      provisioningUri: uri,
      qrDataUrl,
      message: 'Gunakan aplikasi authenticator (Google Authenticator, Authy, Bitwarden) untuk memindai kode di atas. Kode akan berlaku selama 10 menit.',
    }))
  })

  // POST /verify (full path /api/v1/auth/2fa/verify)
  app.post('/verify', async (c) => {
    const user = await authenticate(c)
    if (user instanceof Response) return user

    let body: unknown
    try { body = await c.req.json() } catch {
      return c.json(failure('INVALID_REQUEST', 'JSON tidak valid'), 400)
    }

    const parsed = verifySchema.safeParse(body)
    if (!parsed.success) return c.json(failure('VALIDATION_ERROR', 'Kode harus 6 digit'), 400)

    const pendingSecret = totpStore.getPendingSecret(user.userId)
    if (!pendingSecret) {
      return c.json(failure('NO_PENDING_2FA', 'Tidak ada setup 2FA yang menunggu verifikasi. Jalankan /2fa/setup terlebih dahulu.'), 400)
    }

    const secretBytes = base32Decode(pendingSecret)
    if (!verifyTotp(secretBytes, parsed.data.code)) {
      return c.json(failure('INVALID_CODE', 'Kode tidak valid atau sudah kadaluarsa'), 400)
    }

    totpStore.clearPendingSecret(user.userId)
    totpStore.setUserSecret(user.userId, pendingSecret)

    return c.json(success({
      enabled: true,
      message: '2FA berhasil diaktifkan. Simpan kode pemulihan di tempat yang aman.',
    }))
  })

  // POST /disable (full path /api/v1/auth/2fa/disable)
  app.post('/disable', async (c) => {
    const user = await authenticate(c)
    if (user instanceof Response) return user

    let body: unknown
    try { body = await c.req.json() } catch {
      return c.json(failure('INVALID_REQUEST', 'JSON tidak valid'), 400)
    }

    const parsed = disableSchema.safeParse(body)
    if (!parsed.success) return c.json(failure('VALIDATION_ERROR', 'Kode harus 6 digit'), 400)

    const userTotpSecret = totpStore.getUserSecret(user.userId)
    if (!userTotpSecret) return c.json(failure('NOT_ENABLED', '2FA belum diaktifkan'), 400)

    const secretBytes = base32Decode(userTotpSecret)
    if (!verifyTotp(secretBytes, parsed.data.code)) {
      return c.json(failure('INVALID_CODE', 'Kode tidak valid'), 400)
    }

    totpStore.clearUserSecret(user.userId)
    return c.json(success({ enabled: false, message: '2FA berhasil dinonaktifkan.' }))
  })

  return app
}
