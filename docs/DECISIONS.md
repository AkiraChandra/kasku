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
