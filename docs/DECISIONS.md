# Architecture Decisions

## 2026-10-04 — Kasku M0 Foundation

| Decision | Value | Rationale |
|----------|-------|-----------|
| n8n uses SQLite internal | Not Postgres | n8n ships with SQLite; no Postgres dependency needed |
| Kasku dedicated Postgres | Postgres 16 | Separate instance from n8n; clean isolation |
| Confirm threshold | 2,000,000 (Rp2jt) | Default; user may change later |
| Pay period start day | TBD | Pending user input on payday convention |
| Initial domain | IP/port only | No domain configured yet |
| Receipt storage | Docker volume | `/data/receipts` mounted from `receipts:` named volume |
| Network isolation | `kasku_internal` bridge | n8n/Hermes stay in `n8n_default`; not shared |
| Memory limits | caddy 64m, api 192m, postgres 256m | Baseline; measure and adjust after first deploy |
| Transaction type enum | income, expense, transfer, lend, collect, borrow, repay, adjustment | Extended from initial 3-type to full 8-type per BR-03 |
| Accounts table | `balance` is BIGINT (computed from transactions; seed uses 0) | Per BR-02, balance computed, not stored raw |
| Category aliases | Stored in merchant_rules, not in categories table | Schema doesn't have aliases[] on categories; resolved at query time |
| Deploy method | Build on VPS (dev only) | Prod: GitHub Actions → GHCR → VPS pull only |
| Postgres port | Exposed on 5432 for local dev/debug | Prod: consider bind to 127.0.0.1 only |

## 2026-10-04 — Kasku M8 + M2b Implementation

| Decision | Value | Rationale |
|----------|-------|-----------|
| Auth resolver | `auth-resolver.ts` — unifies session cookie & X-Api-Key | Reports/digest/ingest/2FA routes need flexible auth |
| Backup format | Plain SQL gzip (`pg_dump \| gzip`) | Reliable restore, `grep`-compatible |
| 2FA | RFC 6238 TOTP, mounted at `/api/v1/auth/2fa` | Secret stored in-memory store for MVP; DB persistence planned |
| Ingest auth | X-Api-Key header via `resolveUser(pool)` | n8n WF11-WF15 call `/ingest/transactions` with HMAC-signed webhook payloads |
| n8n timezone | `TIMEZONE=Asia/Jakarta` | All workflow schedules run at 20:00 WIB |
| Digest schedules | WF3 weekly: Sunday 20:00 WIB; WF4 monthly: 1st of month 20:00 WIB | Per blueprint Section 8 |

## 2026-10-05 — Kasku M0–M8 Baseline Resources

| Metric | Value | Notes |
|--------|-------|-------|
| Total Kasku RAM | ~50.7 MB | postgres 10.4MB + api 15.7MB + caddy 24.6MB |
| Swap usage | 1688 MB of 2047 MB | VPS has 2GB RAM + 2GB swap |
| Disk usage | 24 GB of 58 GB (42%) | Healthy headroom |
| Swap concern | High swap = memory pressure | Rebuild swap if pressure returns |
