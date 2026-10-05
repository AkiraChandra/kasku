import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { Pool } from 'pg'
import { formatIDR, parseAmount, AmountParseError } from './lib/money.js'
import { createAuthRoutes } from './lib/auth-routes.js'
import { createDatabaseAuthRepository } from './lib/auth-db-repo.js'
import { createDatabaseFinanceRepository } from './lib/finance-repo.js'
import { createFinanceRoutes } from './lib/finance-routes.js'
import { createBillsRoutes } from './lib/bills-routes.js'
import { createDatabaseBillsRepository } from './lib/bills-repo.js'
import { createAssetsRoutes } from './lib/assets-routes.js'
import { createDatabaseAssetsRepository } from './lib/assets-repo.js'
import { createReportsRoutes } from './lib/reports-routes.js'
import { createDigestRoutes } from './lib/digest-routes.js'
import { createIngestRoutes } from './lib/ingest-routes.js'
import { createTotpRoutes } from './lib/totp-routes.js'
import type { AuthRepository } from './lib/auth-repo.js'
import type { FinanceRepository } from './lib/finance-repo.js'

export type ApiSuccess<T> = { ok: true; data: T; summary_text?: string }
export type ApiFailure = {
  ok: false
  error: { code: string; message: string; field?: string; options?: string[] }
}

export const success = <T>(data: T, summary_text?: string): ApiSuccess<T> => ({
  ok: true,
  data,
  ...(summary_text === undefined ? {} : { summary_text }),
})

export const failure = (
  code: string,
  message: string,
  field?: string,
  options?: string[],
): ApiFailure => ({
  ok: false,
  error: { code, message, ...(field ? { field } : {}), ...(options ? { options } : {}) },
})

type Dependencies = {
  checkDatabase?: () => Promise<'ok' | 'error'>
  pool?: Pool
  authRepo?: AuthRepository
  financeRepo?: FinanceRepository
  billsRepo?: import('./lib/bills-repo.js').BillsRepository
  assetsRepo?: import('./lib/assets-repo.js').AssetsRepository
}

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
    '/api/v1/budgets': {
      get: { summary: 'Daftar budget dengan progres', responses: { '200': { description: 'Daftar budget' }, '401': { description: 'Tidak terautentikasi' } } },
      post: { summary: 'Buat budget', responses: { '201': { description: 'Budget dibuat' }, '400': { description: 'Input tidak valid' }, '401': { description: 'Tidak terautentikasi' } } },
    },
    '/api/v1/budgets/{id}': {
      patch: { summary: 'Perbarui budget', responses: { '200': { description: 'Budget diperbarui' }, '400': { description: 'Input tidak valid' }, '404': { description: 'Budget tidak ditemukan' } } },
      delete: { summary: 'Hapus budget', responses: { '200': { description: 'Budget dihapus' }, '404': { description: 'Budget tidak ditemukan' } } },
    },
    '/api/v1/budgets/{id}/progress': {
      get: { summary: 'Progres budget periode berjalan', responses: { '200': { description: 'Progres budget' }, '404': { description: 'Budget tidak ditemukan' } } },
    },
    '/api/v1/debts': {
      get: { summary: 'Daftar hutang/piutang', parameters: [{ name: 'type', in: 'query', schema: { type: 'string', enum: ['lent_out', 'borrowed'] } }], responses: { '200': { description: 'Daftar hutang' }, '401': { description: 'Tidak terautentikasi' } } },
      post: { summary: 'Buat hutang/piutang', parameters: [{ name: 'Idempotency-Key', in: 'header', required: false, schema: { type: 'string' } }], responses: { '201': { description: 'Hutang dibuat' }, '400': { description: 'Input tidak valid' }, '401': { description: 'Tidak terautentikasi' } } },
    },
    '/api/v1/debts/{id}': {
      get: { summary: 'Detail hutang', responses: { '200': { description: 'Hutang ditemukan' }, '404': { description: 'Hutang tidak ditemukan' } } },
      patch: { summary: 'Perbarui hutang', responses: { '200': { description: 'Hutang diperbarui' }, '400': { description: 'Input tidak valid' }, '404': { description: 'Hutang tidak ditemukan' } } },
      delete: { summary: 'Hapus hutang', responses: { '200': { description: 'Hutang dihapus' }, '404': { description: 'Hutang tidak ditemukan' } } },
    },
    '/api/v1/debts/{id}/payments': {
      post: { summary: 'Catat pembayaran parsial', parameters: [{ name: 'Idempotency-Key', in: 'header', required: false, schema: { type: 'string' } }], responses: { '201': { description: 'Pembayaran dicatat' }, '400': { description: 'Input tidak valid' }, '404': { description: 'Hutang tidak ditemukan' } } },
    },
    '/api/v1/debts/{id}/settle': {
      post: { summary: 'Tandai hutang lunas', responses: { '200': { description: 'Hutang dilunasi' }, '404': { description: 'Hutang tidak ditemukan' } } },
    },
    '/api/v1/dashboard/summary': {
      get: { summary: 'Ringkasan dashboard', responses: { '200': { description: 'Ringkasan saldo, pemasukan, pengeluaran, rasio tabungan' }, '401': { description: 'Tidak terautentikasi' } } },
    },
    '/api/v1/dashboard/cashflow': {
      get: { summary: 'Arus kas harian/mingguan', parameters: [{ name: 'period', in: 'query', required: false, schema: { type: 'string', enum: ['daily', 'weekly'] } }], responses: { '200': { description: 'Arus kas dengan breakdown' }, '401': { description: 'Tidak terautentikasi' } } },
    },
    '/api/v1/dashboard/categories': {
      get: { summary: 'Pengeluaran per kategori bulan ini', responses: { '200': { description: 'Pengelompokan pengeluaran' }, '401': { description: 'Tidak terautentikasi' } } },
    },
    '/api/v1/dashboard/trends': {
      get: { summary: 'Tren bulanan perbandingan antar bulan', responses: { '200': { description: 'Data tren 6 bulan' }, '401': { description: 'Tidak terautentikasi' } } },
    },
    '/api/v1/bills': {
      get: { summary: 'Daftar tagihan', responses: { '200': { description: 'Daftar tagihan aktif' }, '401': { description: 'Tidak terautentikasi' } } },
      post: { summary: 'Buat tagihan', responses: { '201': { description: 'Tagihan dibuat' }, '400': { description: 'Input tidak valid' }, '401': { description: 'Tidak terautentikasi' } } },
    },
    '/api/v1/bills/upcoming': {
      get: { summary: 'Tagihan mendatang', parameters: [{ name: 'days', in: 'query', required: false, schema: { type: 'integer', default: 30 } }], responses: { '200': { description: 'Daftar occurrence' }, '401': { description: 'Tidak terautentikasi' } } },
    },
    '/api/v1/bills/{id}': {
      get: { summary: 'Detail tagihan', responses: { '200': { description: 'Tagihan ditemukan' }, '404': { description: 'Tidak ditemukan' } } },
      patch: { summary: 'Update tagihan', responses: { '200': { description: 'Tagihan diperbarui' }, '400': { description: 'Input tidak valid' }, '404': { description: 'Tidak ditemukan' } } },
      delete: { summary: 'Hapus (arsipkan) tagihan', responses: { '200': { description: 'Tagihan diarsipkan' }, '404': { description: 'Tidak ditemukan' } } },
    },
    '/api/v1/bills/{id}/occurrences': {
      get: { summary: 'Riwayat occurrence tagihan', responses: { '200': { description: 'Occurrence list' }, '404': { description: 'Tagihan tidak ditemukan' } } },
      post: { summary: 'Generate occurrences', responses: { '200': { description: 'Occurrences dihasilkan' }, '404': { description: 'Tagihan tidak ditemukan' } } },
    },
    '/api/v1/bills/{id}/occurrences/{oid}/pay': {
      post: { summary: 'Tandai occurrence lunas', responses: { '200': { description: 'Occurrence ditandai lunas' }, '404': { description: 'Occurrence tidak ditemukan' } } },
    },
    '/api/v1/bills/{id}/occurrences/{oid}/skip': {
      post: { summary: 'Lewatkan occurrence', responses: { '200': { description: 'Occurrence dilewati' }, '404': { description: 'Occurrence tidak ditemukan' } } },
    },
    '/api/v1/assets': {
      get: { summary: 'Daftar aset', responses: { '200': { description: 'Daftar aset' }, '401': { description: 'Tidak terautentikasi' } } },
      post: { summary: 'Buat aset', responses: { '201': { description: 'Aset dibuat' }, '400': { description: 'Input tidak valid' }, '401': { description: 'Tidak terautentikasi' } } },
    },
    '/api/v1/assets/{id}': {
      get: { summary: 'Detail aset', responses: { '200': { description: 'Aset ditemukan' }, '404': { description: 'Tidak ditemukan' } } },
      patch: { summary: 'Update aset', responses: { '200': { description: 'Aset diperbarui' }, '404': { description: 'Tidak ditemukan' } } },
      delete: { summary: 'Arsipkan aset', responses: { '200': { description: 'Aset diarsipkan' }, '404': { description: 'Tidak ditemukan' } } },
    },
    '/api/v1/assets/{id}/valuations': {
      get: { summary: 'Riwayat valuasi aset', responses: { '200': { description: 'Riwayat valuasi' } } },
      post: { summary: 'Tambah valuasi aset', responses: { '201': { description: 'Valuasi tercatat' }, '400': { description: 'Input tidak valid' } } },
    },
    '/api/v1/networth': {
      get: { summary: 'Riwayat snapshot net worth', parameters: [{ name: 'limit', in: 'query', required: false, schema: { type: 'integer', default: 30 } }], responses: { '200': { description: 'Daftar snapshot' }, '401': { description: 'Tidak terautentikasi' } } },
    },
    '/api/v1/networth/breakdown': {
      get: { summary: 'Rincian kekayaan bersih', responses: { '200': { description: 'Breakdown net worth' }, '401': { description: 'Tidak terautentikasi' } } },
    },
    '/api/v1/networth/snapshot': {
      post: { summary: 'Ambil snapshot net worth', responses: { '200': { description: 'Snapshot disimpan' }, '401': { description: 'Tidak terautentikasi' } } },
    },
    '/api/v1/reports/summary': {
      get: { summary: 'Ringkasan laporan', parameters: [{ name: 'period', in: 'query', schema: { type: 'string', enum: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'], default: 'monthly' } }], responses: { '200': { description: 'Ringkasan laporan' }, '401': { description: 'Tidak terautentikasi' }, '429': { description: 'Rate limit exceeded' } } },
    },
    '/api/v1/reports/category-breakdown': {
      get: { summary: 'Breakdown kategori per periode', parameters: [{ name: 'period', in: 'query', schema: { type: 'string', default: 'monthly' } }], responses: { '200': { description: 'Breakdown kategori' }, '401': { description: 'Tidak terautentikasi' } } },
    },
    '/api/v1/reports/cashflow': {
      get: { summary: 'Arus kas per periode', parameters: [{ name: 'period', in: 'query', schema: { type: 'string', default: 'monthly' } }], responses: { '200': { description: 'Arus kas' }, '401': { description: 'Tidak terautentikasi' } } },
    },
    '/api/v1/reports/export': {
      get: { summary: 'Export CSV streaming', parameters: [{ name: 'format', in: 'query', schema: { type: 'string', enum: ['csv'] } }, { name: 'from', in: 'query', schema: { type: 'string' } }, { name: 'to', in: 'query', schema: { type: 'string' } }], responses: { '200': { description: 'CSV stream' }, '400': { description: 'Parameter tidak valid' }, '401': { description: 'Tidak terautentikasi' } } },
    },
    '/api/v1/digest/weekly': {
      get: { summary: 'Digest mingguan', responses: { '200': { description: 'Digest mingguan dengan teks WhatsApp' }, '401': { description: 'Tidak terautentikasi' } } },
    },
    '/api/v1/digest/monthly': {
      get: { summary: 'Digest bulanan', responses: { '200': { description: 'Digest bulanan dengan teks WhatsApp' }, '401': { description: 'Tidak terautentikasi' } } },
    },
    '/api/v1/ingest/transactions': {
      post: { summary: 'Ingest transaksi (n8n)', parameters: [{ name: 'X-Api-Key', in: 'header', required: true, schema: { type: 'string' } }], responses: { '201': { description: 'Transaksi di-ingest' }, '400': { description: 'Validasi gagal' }, '401': { description: 'Tidak terautentikasi' }, '429': { description: 'Rate limit exceeded' } } },
    },
    '/api/v1/ingest/batch': {
      post: { summary: 'Ingest batch transaksi (max 200)', parameters: [{ name: 'X-Api-Key', in: 'header', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Batch hasil' }, '400': { description: 'Validasi gagal' }, '401': { description: 'Tidak terautentikasi' } } },
    },
    '/api/v1/ingest/sources': {
      get: { summary: 'Daftar sumber input', responses: { '200': { description: 'Daftar sumber' }, '401': { description: 'Tidak terautentikasi' } } },
    },
    '/api/v1/auth/2fa/setup': {
      post: { summary: 'Setup 2FA TOTP', responses: { '200': { description: 'Secret dan QR dihasilkan' }, '401': { description: 'Tidak terautentikasi' } } },
    },
    '/api/v1/auth/2fa/verify': {
      post: { summary: 'Verifikasi dan aktifkan 2FA', responses: { '200': { description: '2FA diaktifkan' }, '400': { description: 'Kode tidak valid' } } },
    },
    '/api/v1/auth/2fa/disable': {
      post: { summary: 'Nonaktifkan 2FA', responses: { '200': { description: '2FA dinonaktifkan' }, '400': { description: 'Kode tidak valid' } } },
    },
    '/api/v1/auth/2fa/status': {
      get: { summary: 'Status 2FA', responses: { '200': { description: 'Status 2FA' } } },
    },
  },
} as const

async function defaultDatabaseCheck(): Promise<'ok' | 'error'> {
  if (!process.env.DATABASE_URL) return 'ok'
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 })
  try {
    await pool.query('select 1')
    return 'ok'
  } catch {
    return 'error'
  } finally {
    await pool.end()
  }
}

export function createApp(dependencies: Dependencies = {}) {
  const app = new Hono()
  const checkDatabase = dependencies.checkDatabase ?? defaultDatabaseCheck
  const pool = dependencies.pool ?? (process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL }) : undefined)
  const authRepo = dependencies.authRepo ?? (pool ? createDatabaseAuthRepository(pool) : undefined)
  const financeRepo = dependencies.financeRepo ?? (pool ? createDatabaseFinanceRepository(pool) : undefined)
  const billsRepo = dependencies.billsRepo ?? (pool ? createDatabaseBillsRepository(pool) : undefined)
  const assetsRepo = dependencies.assetsRepo ?? (pool ? createDatabaseAssetsRepository(pool) : undefined)

  if (authRepo) {
    const secure = (process.env.APP_URL ?? '').startsWith('https')
    app.route('/api/v1/auth', createAuthRoutes(authRepo, secure))
    app.route('/api/v1/auth/2fa', createTotpRoutes('kasku_session', undefined, authRepo, pool))
  }
  if (financeRepo) app.route('/api/v1', createFinanceRoutes(financeRepo, authRepo))
  if (billsRepo) app.route('/api/v1', createBillsRoutes(billsRepo, authRepo))
  if (assetsRepo) app.route('/api/v1', createAssetsRoutes(assetsRepo, authRepo))
  // M8 Reports & Digest
  if (pool) {
    app.route('/api/v1/reports', createReportsRoutes(pool, authRepo))
    app.route('/api/v1/digest', createDigestRoutes(pool, authRepo))
    // M2b Ingest (needs pool for Drizzle)
    app.route('/api/v1/ingest', createIngestRoutes(pool, authRepo))
  }

  app.get('/health', async (c) => {
    const db = await checkDatabase()
    return c.json({ ok: true, service: 'kasku-api', db })
  })

  app.get('/api/v1/openapi.json', (c) => c.json(openApiDocument))

  app.get('/api/v1/meta/context', (c) => {
    if (!process.env.DATABASE_URL) {
      return c.json(failure('DATABASE_NOT_CONFIGURED', 'Database belum dikonfigurasi'), 503)
    }
    return c.json(success({ placeholder: true, message: 'Konteks pengguna akan tersedia setelah autentikasi' }))
  })

  app.post('/api/v1/utils/parse-amount', async (c) => {
    let body: { amount?: string | number }
    try {
      body = await c.req.json<{ amount?: string | number }>()
    } catch {
      return c.json(failure('INVALID_REQUEST', 'JSON request tidak valid'), 400)
    }
    if (body.amount === undefined) {
      return c.json(failure('INVALID_AMOUNT', 'Jumlah wajib diisi', 'amount'), 400)
    }
    try {
      const amount = parseAmount(body.amount)
      return c.json(success({ amount, formatted: formatIDR(amount) }, formatIDR(amount)))
    } catch (error) {
      if (error instanceof AmountParseError) {
        return c.json(failure(error.code, error.message, 'amount'), 400)
      }
      return c.json(failure('INVALID_AMOUNT', 'Jumlah tidak valid', 'amount'), 400)
    }
  })

  return app
}

export const app = createApp()

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 3000)
  serve({ fetch: app.fetch, port })
  console.log(`Kasku API listening on ${port}`)
}

export default app
