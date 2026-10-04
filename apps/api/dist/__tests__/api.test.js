import { describe, expect, it } from 'vitest';
import { app } from '../index';
describe('Kasku API foundation', () => {
    it('returns a dependency-safe health response without DATABASE_URL', async () => {
        const response = await app.request('/health');
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ ok: true, service: 'kasku-api', db: 'ok' });
    });
    it('parses an amount through the API route', async () => {
        const response = await app.request('/api/v1/utils/parse-amount', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ amount: '1,5jt' }),
        });
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            ok: true,
            data: { amount: 1_500_000, formatted: 'Rp1.500.000' },
            summary_text: 'Rp1.500.000',
        });
    });
    it('returns a typed API error for an invalid amount', async () => {
        const response = await app.request('/api/v1/utils/parse-amount', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ amount: '25' }),
        });
        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({
            ok: false,
            error: { code: 'AMBIGUOUS_AMOUNT' },
        });
    });
    it('serves valid OpenAPI 3.1 JSON with foundational paths', async () => {
        const response = await app.request('/api/v1/openapi.json');
        expect(response.status).toBe(200);
        const document = await response.json();
        expect(document.openapi).toBe('3.1.0');
        expect(document.paths).toEqual(expect.objectContaining({
            '/health': expect.any(Object),
            '/api/v1/meta/context': expect.any(Object),
            '/api/v1/utils/parse-amount': expect.any(Object),
        }));
        expect(document.paths['/api/v1/utils/parse-amount'].post.requestBody).toBeDefined();
    });
});
