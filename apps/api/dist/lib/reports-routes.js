/**
 * Reports and Export API routes.
 * GET /reports/summary, /reports/category-breakdown, /reports/cashflow, /reports/export
 */
import { Hono } from 'hono';
import { failure, success } from '../index.js';
import { checkRateLimit, API_RATE_LIMIT } from './rate-limit.js';
import { resolveUser, isAuthorizedForScope } from './auth-resolver.js';
import { buildReportSummary, buildCategoryBreakdown, buildCashflowReport, buildInsights, streamCsvExport, } from './reports.js';
export function createReportsRoutes(pool, authRepo, sessionCookie = 'kasku_session') {
    const app = new Hono();
    function rateLimit(c) {
        const ip = c.req.header('x-forwarded-for') ?? c.req.header('cf-connecting-ip') ?? 'anon';
        const result = checkRateLimit(`reports:${ip}`, API_RATE_LIMIT);
        if (!result.allowed) {
            return c.json(failure('RATE_LIMITED', 'Terlalu banyak permintaan'), 429, { 'X-RateLimit-Remaining': '0' });
        }
        return null;
    }
    async function authenticate(c) {
        const user = await resolveUser(c, pool, authRepo, sessionCookie);
        if (!user) {
            return c.json(failure('UNAUTHORIZED', 'Sesi tidak ditemukan, silakan login'), 401);
        }
        if (user.authMethod === 'api_key' && !isAuthorizedForScope(user, 'reports:r')) {
            return c.json(failure('FORBIDDEN', 'API key tidak memiliki izin reports:r'), 403);
        }
        return user.userId;
    }
    // GET /reports/summary?period=monthly
    app.get('/summary', async (c) => {
        const blocked = rateLimit(c);
        if (blocked)
            return blocked;
        const userId = await authenticate(c);
        if (userId instanceof Response)
            return userId;
        const period = (c.req.query('period') ?? 'monthly');
        const summary = await buildReportSummary(pool, userId, period);
        return c.json(success(summary));
    });
    // GET /reports/category-breakdown?period=monthly
    app.get('/category-breakdown', async (c) => {
        const blocked = rateLimit(c);
        if (blocked)
            return blocked;
        const userId = await authenticate(c);
        if (userId instanceof Response)
            return userId;
        const period = (c.req.query('period') ?? 'monthly');
        const breakdown = await buildCategoryBreakdown(pool, userId, period);
        return c.json(success(breakdown));
    });
    // GET /reports/cashflow?period=monthly
    app.get('/cashflow', async (c) => {
        const blocked = rateLimit(c);
        if (blocked)
            return blocked;
        const userId = await authenticate(c);
        if (userId instanceof Response)
            return userId;
        const period = (c.req.query('period') ?? 'monthly');
        const cashflow = await buildCashflowReport(pool, userId, period);
        return c.json(success(cashflow));
    });
    // GET /reports/insights?period=monthly
    app.get('/insights', async (c) => {
        const blocked = rateLimit(c);
        if (blocked)
            return blocked;
        const userId = await authenticate(c);
        if (userId instanceof Response)
            return userId;
        const period = (c.req.query('period') ?? 'monthly');
        const insights = await buildInsights(pool, userId, period);
        return c.json(success(insights));
    });
    // GET /reports/export?format=csv&from=&to=  — streaming response
    app.get('/export', async (c) => {
        const blocked = rateLimit(c);
        if (blocked)
            return blocked;
        const userId = await authenticate(c);
        if (userId instanceof Response)
            return userId;
        const format = c.req.query('format') ?? 'csv';
        if (format !== 'csv') {
            return c.json(failure('UNSUPPORTED_FORMAT', 'Format yang didukung: csv'), 400);
        }
        const fromStr = c.req.query('from');
        const toStr = c.req.query('to');
        if (!fromStr || !toStr) {
            return c.json(failure('MISSING_DATE_RANGE', 'Parameter from dan to wajib diisi'), 400);
        }
        const from = new Date(fromStr);
        const to = new Date(toStr);
        if (isNaN(from.getTime()) || isNaN(to.getTime())) {
            return c.json(failure('INVALID_DATE', 'Format tanggal tidak valid'), 400);
        }
        const filename = `kasku-export-${fromStr}-to-${toStr}.csv`;
        c.header('Content-Type', 'text/csv; charset=utf-8');
        c.header('Content-Disposition', `attachment; filename="${filename}"`);
        c.header('Transfer-Encoding', 'chunked');
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            async start(controller) {
                try {
                    for await (const chunk of streamCsvExport(pool, userId, from, to)) {
                        controller.enqueue(encoder.encode(chunk));
                    }
                    controller.close();
                }
                catch (err) {
                    controller.error(err);
                }
            },
        });
        return c.body(stream, 200);
    });
    return app;
}
