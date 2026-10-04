import { describe, it, expect, beforeEach } from 'vitest';
import { hashPassword, verifyPassword, generateSessionToken, hashToken } from '../lib/auth.js';
import { inMemoryAuthRepository } from '../lib/auth-repo.js';
import { createAuthRoutes } from '../lib/auth-routes.js';
import { Hono } from 'hono';
// ── helpers ──────────────────────────────────────────────────────────────────
function makeApp(repo, secure = false) {
    const app = new Hono();
    app.route('/api/v1/auth', createAuthRoutes(repo, secure));
    return app;
}
function withSession(app, path, opts = {}, token) {
    return app.request(path, {
        ...opts,
        headers: {
            ...opts.headers,
            'cookie': `kasku_session=${token}`,
        },
    });
}
// ── password primitives ───────────────────────────────────────────────────────
describe('hashPassword / verifyPassword', () => {
    it('produces a non-empty hash string', async () => {
        const h = await hashPassword('test-password-123');
        expect(h).toBeTruthy();
        expect(typeof h).toBe('string');
        expect(h.length).toBeGreaterThan(20);
    });
    it('produces different hashes for the same password (salted)', async () => {
        const h1 = await hashPassword('same-password');
        const h2 = await hashPassword('same-password');
        expect(h1).not.toBe(h2);
    });
    it('verifies correct password', async () => {
        const pw = 'secure-password-xyz';
        const h = await hashPassword(pw);
        expect(await verifyPassword(h, pw)).toBe(true);
    });
    it('rejects incorrect password', async () => {
        const h = await hashPassword('correct-password');
        expect(await verifyPassword(h, 'wrong-password')).toBe(false);
    });
    it('rejects tampered hash', async () => {
        const h = await hashPassword('my-password');
        const tampered = h.slice(0, -2) + 'XX';
        expect(await verifyPassword(tampered, 'my-password')).toBe(false);
    });
});
describe('generateSessionToken', () => {
    it('generates a base64url token of expected byte length', () => {
        const t = generateSessionToken();
        expect(typeof t).toBe('string');
        // SESSION_TOKEN_BYTES base64url encoded produces at least this many chars
        expect(t.length).toBeGreaterThanOrEqual(40);
        // Should not contain + / = (base64url safe)
        expect(t).not.toMatch(/[+/=]/);
    });
    it('generates unique tokens', () => {
        const tokens = new Set(Array.from({ length: 100 }, generateSessionToken));
        expect(tokens.size).toBe(100);
    });
});
describe('hashToken', () => {
    it('produces a deterministic sha256 hex hash', () => {
        const t = 'test-token-abc';
        const h1 = hashToken(t);
        const h2 = hashToken(t);
        expect(h1).toBe(h2);
        expect(h1).toMatch(/^[a-f0-9]{64}$/);
    });
    it('produces different hashes for different tokens', () => {
        expect(hashToken('token-a')).not.toBe(hashToken('token-b'));
    });
});
// ── in-memory repository ──────────────────────────────────────────────────────
describe('inMemoryAuthRepository', () => {
    let repo;
    beforeEach(() => {
        // Reset the module-level maps by re-importing via a fresh instance
        // Since module state persists, we clear manually
        repo = inMemoryAuthRepository;
    });
    describe('createUser / findUserByEmail', () => {
        it('creates a user and finds it by email', async () => {
            const hash = await hashPassword('test123');
            const user = await repo.createUser({ email: 'test@example.com', passwordHash: hash, name: 'Test User' });
            expect(user.email).toBe('test@example.com');
            expect(user.passwordHash).toBe(hash);
            expect(user.name).toBe('Test User');
            const found = await repo.findUserByEmail('test@example.com');
            expect(found).not.toBeNull();
            expect(found.id).toBe(user.id);
        });
        it('is case-insensitive on email', async () => {
            const hash = await hashPassword('pw');
            await repo.createUser({ email: 'User@Example.COM', passwordHash: hash, name: 'Name' });
            const found = await repo.findUserByEmail('user@example.com');
            expect(found).not.toBeNull();
        });
        it('upserts on duplicate email', async () => {
            const hash1 = await hashPassword('pw1');
            const hash2 = await hashPassword('pw2');
            const u1 = await repo.createUser({ email: 'dup@test.com', passwordHash: hash1, name: 'First' });
            const u2 = await repo.createUser({ email: 'dup@test.com', passwordHash: hash2, name: 'Second' });
            expect(u1.id).toBe(u2.id);
            expect(u2.passwordHash).toBe(hash2);
            expect(u2.name).toBe('Second');
        });
        it('returns null for unknown email', async () => {
            expect(await repo.findUserByEmail('nobody@nowhere.com')).toBeNull();
        });
    });
    describe('sessions', () => {
        it('creates and finds a session by token hash', async () => {
            const hash = await hashPassword('pw');
            const user = await repo.createUser({ email: 's@test.com', passwordHash: hash, name: 'Sess' });
            const tokenHash = hashToken(generateSessionToken());
            const expiresAt = new Date(Date.now() + 86400000);
            const session = await repo.createSession({ userId: user.id, tokenHash, expiresAt });
            expect(session.id).toBeTruthy();
            const found = await repo.findSessionByTokenHash(tokenHash);
            expect(found).not.toBeNull();
            expect(found.user.id).toBe(user.id);
        });
        it('expires old sessions', async () => {
            const hash = await hashPassword('pw');
            const user = await repo.createUser({ email: 'exp@test.com', passwordHash: hash, name: 'Exp' });
            const tokenHash = hashToken(generateSessionToken());
            const expired = new Date(Date.now() - 1000);
            await repo.createSession({ userId: user.id, tokenHash, expiresAt: expired });
            expect(await repo.findSessionByTokenHash(tokenHash)).toBeNull();
        });
        it('deletes a session', async () => {
            const hash = await hashPassword('pw');
            const user = await repo.createUser({ email: 'del@test.com', passwordHash: hash, name: 'Del' });
            const tokenHash = hashToken(generateSessionToken());
            const session = await repo.createSession({ userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 86400000) });
            await repo.deleteSession(session.id);
            expect(await repo.findSessionByTokenHash(tokenHash)).toBeNull();
        });
        it('deletes all sessions for a user', async () => {
            const hash = await hashPassword('pw');
            const user = await repo.createUser({ email: 'multi@test.com', passwordHash: hash, name: 'Multi' });
            const t1 = hashToken(generateSessionToken());
            const t2 = hashToken(generateSessionToken());
            const exp = new Date(Date.now() + 86400000);
            await repo.createSession({ userId: user.id, tokenHash: t1, expiresAt: exp });
            await repo.createSession({ userId: user.id, tokenHash: t2, expiresAt: exp });
            await repo.deleteUserSessions(user.id);
            expect(await repo.findSessionByTokenHash(t1)).toBeNull();
            expect(await repo.findSessionByTokenHash(t2)).toBeNull();
        });
    });
});
// ── auth routes ──────────────────────────────────────────────────────────────
describe('auth routes (with in-memory repo)', () => {
    let repo;
    let app;
    const TEST_PASSWORD = 'test-secret-789';
    beforeEach(async () => {
        repo = inMemoryAuthRepository;
        const hash = await hashPassword(TEST_PASSWORD);
        await repo.createUser({ email: 'auth@test.com', passwordHash: hash, name: 'Auth User' });
        app = makeApp(repo, false);
    });
    // POST /api/v1/auth/login
    describe('POST /api/v1/auth/login', () => {
        it('returns 400 for invalid JSON', async () => {
            const res = await app.request('/api/v1/auth/login', {
                method: 'POST',
                headers: { 'content-type': 'text/plain' },
                body: 'not-json',
            });
            expect(res.status).toBe(400);
            const body = await res.json();
            expect(body.ok).toBe(false);
            expect(body.error.code).toBe('INVALID_REQUEST');
        });
        it('returns 400 for missing fields', async () => {
            const res = await app.request('/api/v1/auth/login', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ email: 'auth@test.com' }),
            });
            expect(res.status).toBe(400);
        });
        it('returns 400 for invalid email format', async () => {
            const res = await app.request('/api/v1/auth/login', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ email: 'not-an-email', password: 'pw' }),
            });
            expect(res.status).toBe(400);
            const body = await res.json();
            expect(body.error.code).toBe('VALIDATION_ERROR');
        });
        it('returns 401 for wrong password', async () => {
            const res = await app.request('/api/v1/auth/login', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ email: 'auth@test.com', password: 'wrong-password' }),
            });
            expect(res.status).toBe(401);
            const body = await res.json();
            expect(body.error.code).toBe('INVALID_CREDENTIALS');
        });
        it('returns 401 for unknown email', async () => {
            const res = await app.request('/api/v1/auth/login', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ email: 'nobody@test.com', password: 'any-password' }),
            });
            expect(res.status).toBe(401);
            const body = await res.json();
            expect(body.error.code).toBe('INVALID_CREDENTIALS');
        });
        it('returns 200 and sets cookie on success', async () => {
            const res = await app.request('/api/v1/auth/login', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ email: 'auth@test.com', password: TEST_PASSWORD }),
            });
            expect(res.status).toBe(200);
            const body = await res.json();
            expect(body.ok).toBe(true);
            expect(body.data.email).toBe('auth@test.com');
            expect(body.data.name).toBe('Auth User');
            // Cookie should be set
            const setCookies = res.headers.get('set-cookie');
            expect(setCookies).toBeTruthy();
            expect(setCookies).toContain('kasku_session=');
            expect(setCookies).toContain('HttpOnly');
            expect(setCookies).toContain('SameSite=Lax');
        });
        it('is case-insensitive on email', async () => {
            const res = await app.request('/api/v1/auth/login', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ email: 'AUTH@TEST.COM', password: TEST_PASSWORD }),
            });
            expect(res.status).toBe(200);
        });
    });
    // GET /api/v1/auth/me
    describe('GET /api/v1/auth/me', () => {
        it('returns 401 without session cookie', async () => {
            const res = await app.request('/api/v1/auth/me');
            expect(res.status).toBe(401);
            const body = await res.json();
            expect(body.error.code).toBe('UNAUTHORIZED');
        });
        it('returns 401 with invalid token', async () => {
            const res = await app.request('/api/v1/auth/me', {
                headers: { 'cookie': 'kasku_session=invalid-token' },
            });
            expect(res.status).toBe(401);
            const body = await res.json();
            expect(body.error.code).toBe('SESSION_EXPIRED');
        });
        it('returns user data with valid session', async () => {
            // Login first to get a real token
            const loginRes = await app.request('/api/v1/auth/login', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ email: 'auth@test.com', password: TEST_PASSWORD }),
            });
            const cookie = loginRes.headers.get('set-cookie') ?? '';
            const match = cookie.match(/kasku_session=([^;]+)/);
            expect(match).not.toBeNull();
            const token = match[1];
            const meRes = await app.request('/api/v1/auth/me', {
                headers: { 'cookie': `kasku_session=${token}` },
            });
            expect(meRes.status).toBe(200);
            const body = await meRes.json();
            expect(body.ok).toBe(true);
            expect(body.data.email).toBe('auth@test.com');
            expect(body.data.name).toBe('Auth User');
        });
    });
    // POST /api/v1/auth/logout
    describe('POST /api/v1/auth/logout', () => {
        it('succeeds even without session', async () => {
            const res = await app.request('/api/v1/auth/logout', { method: 'POST' });
            expect(res.status).toBe(200);
            const body = await res.json();
            expect(body.ok).toBe(true);
        });
        it('clears the session cookie', async () => {
            // Login first
            const loginRes = await app.request('/api/v1/auth/login', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ email: 'auth@test.com', password: TEST_PASSWORD }),
            });
            const cookie = loginRes.headers.get('set-cookie') ?? '';
            const match = cookie.match(/kasku_session=([^;]+)/);
            const token = match[1];
            // Logout
            const logoutRes = await app.request('/api/v1/auth/logout', {
                method: 'POST',
                headers: { 'cookie': `kasku_session=${token}` },
            });
            expect(logoutRes.status).toBe(200);
            // Session should be invalid now
            const meRes = await app.request('/api/v1/auth/me', {
                headers: { 'cookie': `kasku_session=${token}` },
            });
            expect(meRes.status).toBe(401);
        });
    });
    // Cookie security
    describe('cookie security', () => {
        it('sets secure=true when secure flag is true', async () => {
            const secureApp = makeApp(repo, true);
            const res = await secureApp.request('/api/v1/auth/login', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ email: 'auth@test.com', password: TEST_PASSWORD }),
            });
            const setCookies = res.headers.get('set-cookie') ?? '';
            expect(setCookies).toContain('Secure');
        });
        it('sets secure=false when secure flag is false', async () => {
            const res = await app.request('/api/v1/auth/login', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ email: 'auth@test.com', password: TEST_PASSWORD }),
            });
            const setCookies = res.headers.get('set-cookie') ?? '';
            expect(setCookies).not.toContain('Secure');
        });
    });
});
