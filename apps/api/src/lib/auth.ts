import { randomBytes, createHash } from 'crypto'
import { hash, verify, Algorithm } from '@node-rs/argon2'

export const SESSION_TOKEN_BYTES = 32

export async function hashPassword(password: string): Promise<string> {
  return hash(password, {
    algorithm: Algorithm.Argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  })
}

export async function verifyPassword(hash_: string, password: string): Promise<boolean> {
  try {
    return await verify(hash_, password)
  } catch {
    return false
  }
}

export function generateSessionToken(): string {
  return randomBytes(SESSION_TOKEN_BYTES).toString('base64url')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
