import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { Pool } from 'pg';
import { formatIDR, parseAmount, AmountParseError } from './lib/money.js';
import { createAuthRoutes } from './lib/auth-routes.js';
import { createDatabaseAuthRepository } from './lib/auth-db-repo.js';
import { createDatabaseFinanceRepository } from './lib/finance-repo.js';
import { createFinanceRoutes } from './lib/finance-routes.js';
export const success = (data, summary_text) => ({
    ok: true,
    data,
    ...(summary_text === undefined ? {} : { summary_text }),
});
export const failure = (code, message, field, options) => ({
    ok: false,
    error: { code, message, ...(field ? { field } : {}), ...(options ? { options } : {}) },
});
const openApiDocument = {
    openapi: '3.1.0',
    info: { title: 'Kasku API', version: '0.1.0', description: 'API keuangan pribadi Kasku' },
    paths: {
        '/health': {
            get: {
                summary: 'Status layanan',
                responses: { '200': { description: 'Status layanan' } },
            },
        },
        '/api/v1/meta/context': {
            get: {
                summary: 'Konteks pengguna aktif',
                responses: {
                    '200': { description: 'Konteks tersedia' },
                    '503': { description: 'Database belum dikonfigurasi' },
                },
            },
        },
        '/api/v1/utils/parse-amount': {
            post: {
                summary: 'Parse jumlah Rupiah',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['amount'],
                                properties: {
                                    amount: {
                                        oneOf: [
                                            { type: 'string' },
                                            { type: 'integer' },
                                        ],
                                    },
                                },
                            },
                        },
                    },
                },
                responses: {
                    '200': { description: 'Jumlah berhasil diparse' },
                    '400': { description: 'Jumlah tidak valid' },
                },
            },
        },
        '/api/v1/auth/login': {
            post: {
                summary: 'Login pengguna',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['email', 'password'],
                                properties: {
                                    email: { type: 'string' },
                                    password: { type: 'string' },
                                },
                            },
                        },
                    },
                },
                responses: {
                    '200': { description: 'Login berhasil' },
                    '401': { description: 'Email atau password salah' },
                    '429': { description: 'Rate limit exceeded' },
                },
            },
        },
        '/api/v1/auth/me': {
            get: {
                summary: 'Dapatkan pengguna aktif',
                responses: {
                    '200': { description: 'Pengguna ditemukan' },
                    '401': { description: 'Sesi tidak valid' },
                },
            },
        },
        '/api/v1/auth/logout': {
            post: {
                summary: 'Logout pengguna',
                responses: {
                    '200': { description: 'Logout berhasil' },
                },
            },
        },
        '/api/v1/accounts': {
            get: { summary: 'Daftar akun', responses: { '200': { description: 'Daftar akun' }, '401': { description: 'Tidak terautentikasi' } } },
            post: { summary: 'Buat akun', responses: { '201': { description: 'Akun dibuat' }, '400': { description: 'Input tidak valid' }, '401': { description: 'Tidak terautentikasi' } } },
        },
        '/api/v1/accounts/{id}': {
            delete: { summary: 'Arsipkan akun', responses: { '200': { description: 'Akun diarsipkan' }, '404': { description: 'Akun tidak ditemukan' } } },
        },
        '/api/v1/categories': {
            get: { summary: 'Daftar kategori', responses: { '200': { description: 'Daftar kategori' }, '401': { description: 'Tidak terautentikasi' } } },
            post: { summary: 'Buat kategori', responses: { '201': { description: 'Kategori dibuat' }, '400': { description: 'Input tidak valid' }, '401': { description: 'Tidak terautentikasi' } } },
        },
        '/api/v1/transactions': {
            get: { summary: 'Daftar transaksi', responses: { '200': { description: 'Daftar transaksi' }, '401': { description: 'Tidak terautentikasi' } } },
            post: { summary: 'Catat transaksi', parameters: [{ name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string' } }], responses: { '201': { description: 'Transaksi dicatat' }, '400': { description: 'Input tidak valid' }, '401': { description: 'Tidak terautentikasi' } } },
        },
        '/api/v1/transactions/{id}': {
            delete: { summary: 'Hapus transaksi secara lunak', responses: { '200': { description: 'Transaksi dihapus' }, '404': { description: 'Transaksi tidak ditemukan' } } },
        },
    },
};
async function defaultDatabaseCheck() {
    if (!process.env.DATABASE_URL)
        return 'ok';
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    try {
        await pool.query('select 1');
        return 'ok';
    }
    catch {
        return 'error';
    }
    finally {
        await pool.end();
    }
}
export function createApp(dependencies = {}) {
    const app = new Hono();
    const checkDatabase = dependencies.checkDatabase ?? defaultDatabaseCheck;
    const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL }) : undefined;
    const authRepo = dependencies.authRepo ?? (pool ? createDatabaseAuthRepository(pool) : undefined);
    const financeRepo = dependencies.financeRepo ?? (pool ? createDatabaseFinanceRepository(pool) : undefined);
    if (authRepo) {
        const secure = (process.env.APP_URL ?? '').startsWith('https');
        app.route('/api/v1/auth', createAuthRoutes(authRepo, secure));
    }
    if (financeRepo)
        app.route('/api/v1', createFinanceRoutes(financeRepo, authRepo));
    app.get('/health', async (c) => {
        const db = await checkDatabase();
        return c.json({ ok: true, service: 'kasku-api', db });
    });
    app.get('/api/v1/openapi.json', (c) => c.json(openApiDocument));
    app.get('/api/v1/meta/context', (c) => {
        if (!process.env.DATABASE_URL) {
            return c.json(failure('DATABASE_NOT_CONFIGURED', 'Database belum dikonfigurasi'), 503);
        }
        return c.json(success({ placeholder: true, message: 'Konteks pengguna akan tersedia setelah autentikasi' }));
    });
    app.post('/api/v1/utils/parse-amount', async (c) => {
        let body;
        try {
            body = await c.req.json();
        }
        catch {
            return c.json(failure('INVALID_REQUEST', 'JSON request tidak valid'), 400);
        }
        if (body.amount === undefined) {
            return c.json(failure('INVALID_AMOUNT', 'Jumlah wajib diisi', 'amount'), 400);
        }
        try {
            const amount = parseAmount(body.amount);
            return c.json(success({ amount, formatted: formatIDR(amount) }, formatIDR(amount)));
        }
        catch (error) {
            if (error instanceof AmountParseError) {
                return c.json(failure(error.code, error.message, 'amount'), 400);
            }
            return c.json(failure('INVALID_AMOUNT', 'Jumlah tidak valid', 'amount'), 400);
        }
    });
    return app;
}
export const app = createApp();
if (import.meta.url === `file://${process.argv[1]}`) {
    const port = Number(process.env.PORT ?? 3000);
    serve({ fetch: app.fetch, port });
    console.log(`Kasku API listening on ${port}`);
}
export default app;
