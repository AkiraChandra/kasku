# Kasku

Personal finance, WhatsApp-first.

Stack: Hono + React/Vite + PostgreSQL.

## API endpoint

Total: **67 endpoint**.

Base URL: `/api/v1`, kecuali endpoint sistem `/health`.

Semua response JSON memakai format `{ ok: true, data }` atau `{ ok: false, error }`, kecuali endpoint export yang mengembalikan CSV.

### System dan utility

| Method | Endpoint | Fungsi |
|---|---|---|
| GET | `/health` | Cek status API dan koneksi database. |
| GET | `/api/v1/openapi.json` | Ambil dokumentasi OpenAPI API. |
| GET | `/api/v1/meta/context` | Ambil konteks pengguna aktif; placeholder sampai autentikasi tersedia. |
| POST | `/api/v1/utils/parse-amount` | Parse nominal Rupiah menjadi angka dan format IDR. |

### Authentication dan 2FA

| Method | Endpoint | Fungsi |
|---|---|---|
| POST | `/api/v1/auth/login` | Login dengan email dan password; membuat session cookie. |
| GET | `/api/v1/auth/me` | Ambil data pengguna dari session aktif. |
| POST | `/api/v1/auth/logout` | Hapus session aktif dan cookie. |
| POST | `/api/v1/auth/2fa/setup` | Buat secret TOTP dan provisioning URI/QR. |
| POST | `/api/v1/auth/2fa/verify` | Verifikasi kode TOTP dan aktifkan 2FA. |
| POST | `/api/v1/auth/2fa/disable` | Nonaktifkan 2FA setelah verifikasi kode TOTP. |
| GET | `/api/v1/auth/2fa/status` | Cek status 2FA pengguna. |

### Accounts, categories, transactions, budget, debt, dashboard

| Method | Endpoint | Fungsi |
|---|---|---|
| GET | `/api/v1/accounts` | Daftar akun keuangan. |
| POST | `/api/v1/accounts` | Buat akun keuangan. |
| DELETE | `/api/v1/accounts/:id` | Arsipkan akun. |
| GET | `/api/v1/categories` | Daftar kategori transaksi. |
| POST | `/api/v1/categories` | Buat kategori transaksi. |
| GET | `/api/v1/transactions` | Daftar transaksi dengan filter/pagination. |
| POST | `/api/v1/transactions` | Catat transaksi; mendukung idempotency key. |
| PATCH | `/api/v1/transactions/:id` | Perbarui transaksi. |
| DELETE | `/api/v1/transactions/:id` | Hapus transaksi secara soft delete. |
| POST | `/api/v1/transactions/:id/restore` | Pulihkan transaksi yang dihapus. |
| GET | `/api/v1/budgets` | Daftar budget beserta progres. |
| POST | `/api/v1/budgets` | Buat budget. |
| PATCH | `/api/v1/budgets/:id` | Perbarui budget. |
| DELETE | `/api/v1/budgets/:id` | Hapus budget. |
| GET | `/api/v1/budgets/:id/progress` | Ambil progres budget periode berjalan. |
| GET | `/api/v1/debts` | Daftar hutang/piutang; bisa filter `type`. |
| POST | `/api/v1/debts` | Buat hutang/piutang. |
| GET | `/api/v1/debts/:id` | Ambil detail hutang/piutang. |
| PATCH | `/api/v1/debts/:id` | Perbarui hutang/piutang. |
| DELETE | `/api/v1/debts/:id` | Hapus hutang/piutang. |
| POST | `/api/v1/debts/:id/payments` | Catat pembayaran parsial hutang/piutang. |
| POST | `/api/v1/debts/:id/settle` | Tandai hutang/piutang lunas. |
| GET | `/api/v1/dashboard/summary` | Ringkasan saldo, pemasukan, pengeluaran, dan rasio tabungan. |
| GET | `/api/v1/dashboard/cashflow` | Arus kas harian atau mingguan. |
| GET | `/api/v1/dashboard/categories` | Pengeluaran per kategori bulan berjalan. |
| GET | `/api/v1/dashboard/trends` | Tren keuangan enam bulan. |

### Bills / tagihan

| Method | Endpoint | Fungsi |
|---|---|---|
| GET | `/api/v1/bills` | Daftar tagihan aktif. |
| POST | `/api/v1/bills` | Buat tagihan berulang. |
| GET | `/api/v1/bills/upcoming` | Daftar tagihan mendatang; query `days`, maksimum 90. |
| GET | `/api/v1/bills/:id` | Ambil detail tagihan. |
| PATCH | `/api/v1/bills/:id` | Perbarui tagihan. |
| DELETE | `/api/v1/bills/:id` | Arsipkan tagihan. |
| GET | `/api/v1/bills/:id/occurrences` | Ambil riwayat occurrence tagihan. |
| POST | `/api/v1/bills/:id/occurrences/generate` | Generate occurrence tagihan. |
| POST | `/api/v1/bills/:id/occurrences/:oid/pay` | Tandai occurrence sebagai lunas. |
| POST | `/api/v1/bills/:id/occurrences/:oid/skip` | Lewati occurrence tagihan. |

### Assets dan net worth

| Method | Endpoint | Fungsi |
|---|---|---|
| GET | `/api/v1/assets` | Daftar aset. |
| POST | `/api/v1/assets` | Buat aset. |
| GET | `/api/v1/assets/:id` | Ambil detail aset. |
| PATCH | `/api/v1/assets/:id` | Perbarui aset. |
| DELETE | `/api/v1/assets/:id` | Arsipkan aset. |
| GET | `/api/v1/assets/:id/valuations` | Ambil riwayat valuasi aset. |
| POST | `/api/v1/assets/:id/valuations` | Tambah valuasi aset. |
| GET | `/api/v1/networth` | Ambil snapshot net worth; query `limit`. |
| GET | `/api/v1/networth/breakdown` | Ambil rincian aset, kewajiban, dan net worth. |
| POST | `/api/v1/networth/snapshot` | Simpan snapshot net worth saat ini. |

### Reports dan digest

| Method | Endpoint | Fungsi |
|---|---|---|
| GET | `/api/v1/reports/summary` | Ringkasan laporan berdasarkan `period`. |
| GET | `/api/v1/reports/category-breakdown` | Breakdown kategori berdasarkan periode. |
| GET | `/api/v1/reports/cashflow` | Laporan arus kas berdasarkan periode. |
| GET | `/api/v1/reports/insights` | Insight keuangan berdasarkan periode. |
| GET | `/api/v1/reports/export` | Streaming export transaksi CSV; wajib `from` dan `to`. |
| GET | `/api/v1/digest/weekly` | Digest mingguan, termasuk teks siap dikirim via WhatsApp. |
| GET | `/api/v1/digest/monthly` | Digest bulanan, termasuk teks siap dikirim via WhatsApp. |

### Ingest untuk n8n / WhatsApp

| Method | Endpoint | Fungsi |
|---|---|---|
| GET | `/api/v1/ingest/sources` | Daftar sumber input transaksi. |
| POST | `/api/v1/ingest/transactions` | Ingest satu transaksi dari n8n atau API key; mendukung deduplikasi dan HMAC. |
| POST | `/api/v1/ingest/batch` | Ingest batch maksimum 200 transaksi; mendukung deduplikasi. |

Endpoint terproteksi membutuhkan session cookie `kasku_session` atau API key dengan scope yang sesuai. Endpoint ingest memakai header `X-Api-Key` sesuai konfigurasi.

Dev: see [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md)
