import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../lib/auth-resolver.js', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, resolveUser: vi.fn() };
});
vi.mock('../lib/reports.js', () => ({
    buildReportSummary: vi.fn(async () => ({ ok: true })),
    buildCategoryBreakdown: vi.fn(async () => ({ ok: true })),
    buildCashflowReport: vi.fn(async () => ({ ok: true })),
    buildInsights: vi.fn(async () => ({ ok: true })),
    streamCsvExport: vi.fn(async function* () { yield 'ok'; }),
}));
vi.mock('../lib/digest.js', () => ({
    buildDigest: vi.fn(async () => ({ text: 'digest' })),
}));
import { hasApiScope, isAuthorizedForScope, resolveUser } from '../lib/auth-resolver.js';
import { createReportsRoutes } from '../lib/reports-routes.js';
import { createDigestRoutes } from '../lib/digest-routes.js';
const mockedResolveUser = vi.mocked(resolveUser);
const pool = {};
beforeEach(() => {
    vi.clearAllMocks();
});
describe('API-key scope authorization', () => {
    it('matches only explicitly granted scopes', () => {
        expect(hasApiScope(['reports:r'], 'reports:r')).toBe(true);
        expect(hasApiScope(['reports:r'], 'digest:r')).toBe(false);
        expect(hasApiScope(undefined, 'reports:r')).toBe(false);
        expect(isAuthorizedForScope({ authMethod: 'api_key', scopes: ['reports:r'] }, 'reports:r')).toBe(true);
        expect(isAuthorizedForScope({ authMethod: 'api_key', scopes: ['reports:r'] }, 'digest:r')).toBe(false);
        expect(isAuthorizedForScope({ authMethod: 'session', scopes: null }, 'reports:r')).toBe(true);
    });
});
describe('report and digest routes', () => {
    it('rejects an API key without reports:r', async () => {
        mockedResolveUser.mockResolvedValue({
            userId: 'user-1', userEmail: 'user@example.com', authMethod: 'api_key', scopes: ['digest:r'],
        });
        const response = await createReportsRoutes(pool).request('/summary');
        expect(response.status).toBe(403);
    });
    it('allows an API key with reports:r', async () => {
        mockedResolveUser.mockResolvedValue({
            userId: 'user-1', userEmail: 'user@example.com', authMethod: 'api_key', scopes: ['reports:r'],
        });
        const response = await createReportsRoutes(pool).request('/summary');
        expect(response.status).toBe(200);
    });
    it('rejects an API key without digest:r', async () => {
        mockedResolveUser.mockResolvedValue({
            userId: 'user-1', userEmail: 'user@example.com', authMethod: 'api_key', scopes: ['reports:r'],
        });
        const response = await createDigestRoutes(pool).request('/weekly');
        expect(response.status).toBe(403);
    });
    it('allows an API key with digest:r', async () => {
        mockedResolveUser.mockResolvedValue({
            userId: 'user-1', userEmail: 'user@example.com', authMethod: 'api_key', scopes: ['digest:r'],
        });
        const response = await createDigestRoutes(pool).request('/weekly');
        expect(response.status).toBe(200);
    });
});
