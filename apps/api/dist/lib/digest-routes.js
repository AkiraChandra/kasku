/**
 * Digest API routes.
 * GET /digest/weekly, /digest/monthly
 */
import { Hono } from 'hono';
import { failure, success } from '../index.js';
import { checkRateLimit, API_RATE_LIMIT } from './rate-limit.js';
import { buildDigest } from './digest.js';
import { resolveUser, isAuthorizedForScope } from './auth-resolver.js';
export function createDigestRoutes(pool, authRepo, sessionCookie = 'kasku_session') {
    const app = new Hono();
    function rateLimit(c) {
        const ip = c.req.header('x-forwarded-for') ?? c.req.header('cf-connecting-ip') ?? 'anon';
        const result = checkRateLimit(`digest:${ip}`, API_RATE_LIMIT);
        if (!result.allowed) {
            return c.json(failure('RATE_LIMITED', 'Terlalu banyak permintaan'), 429);
        }
        return null;
    }
    async function authenticate(c) {
        const user = await resolveUser(c, pool, authRepo, sessionCookie);
        if (!user) {
            return c.json(failure('UNAUTHORIZED', 'Sesi tidak ditemukan, silakan login'), 401);
        }
        if (user.authMethod === 'api_key' && !isAuthorizedForScope(user, 'digest:r')) {
            return c.json(failure('FORBIDDEN', 'API key tidak memiliki izin digest:r'), 403);
        }
        return user.userId;
    }
    // GET /digest/weekly
    app.get('/weekly', async (c) => {
        const blocked = rateLimit(c);
        if (blocked)
            return blocked;
        const userId = await authenticate(c);
        if (userId instanceof Response)
            return userId;
        const digest = await buildDigest(pool, userId, 'weekly');
        return c.json(success(digest, digest.text));
    });
    // GET /digest/monthly
    app.get('/monthly', async (c) => {
        const blocked = rateLimit(c);
        if (blocked)
            return blocked;
        const userId = await authenticate(c);
        if (userId instanceof Response)
            return userId;
        const digest = await buildDigest(pool, userId, 'monthly');
        return c.json(success(digest, digest.text));
    });
    return app;
}
