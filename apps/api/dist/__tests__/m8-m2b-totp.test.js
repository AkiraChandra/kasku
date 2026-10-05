import { describe, it, expect } from 'vitest';
import { createApp } from '../index.js';
import { inMemoryAuthRepository } from '../lib/auth-repo.js';
import { hashToken } from '../lib/auth.js';
const poolStub = {};
describe('M8, M2b & TOTP Endpoints', () => {
    it('secures reports and digest endpoints with 401 when unauthenticated', async () => {
        const app = createApp({ authRepo: inMemoryAuthRepository, pool: poolStub });
        const resReports = await app.request('/api/v1/reports/summary');
        expect(resReports.status).toBe(401);
        const resDigest = await app.request('/api/v1/digest/weekly');
        expect(resDigest.status).toBe(401);
        const resTotp = await app.request('/api/v1/auth/2fa/status');
        expect(resTotp.status).toBe(401);
    });
    it('allows authenticated 2FA status check and setup flow', async () => {
        const user = await inMemoryAuthRepository.createUser({
            email: 'm8test@kasku.local',
            passwordHash: 'hash',
            name: 'M8 Test',
        });
        const token = 'test-token-123';
        const expiresAt = new Date(Date.now() + 3600_000);
        await inMemoryAuthRepository.createSession({
            userId: user.id,
            tokenHash: hashToken(token),
            expiresAt,
        });
        const app = createApp({ authRepo: inMemoryAuthRepository, pool: poolStub });
        // Check status
        const statusRes = await app.request('/api/v1/auth/2fa/status', {
            headers: { cookie: `kasku_session=${token}` },
        });
        expect(statusRes.status).toBe(200);
        const statusBody = await statusRes.json();
        expect(statusBody.data.enabled).toBe(false);
        // Setup 2FA
        const setupRes = await app.request('/api/v1/auth/2fa/setup', {
            method: 'POST',
            headers: { cookie: `kasku_session=${token}` },
        });
        expect(setupRes.status).toBe(200);
        const setupBody = await setupRes.json();
        expect(setupBody.data.secret).toBeDefined();
        expect(setupBody.data.qrDataUrl).toBeDefined();
    });
});
