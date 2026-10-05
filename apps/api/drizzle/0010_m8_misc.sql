-- M8 + M2b: ingest_sources table + enriched transactions columns
-- Idempotent: IF NOT EXISTS for tables, DROP IF EXISTS safe for columns

-- 1) Add new columns to transactions (skip if already exist)
DO $$
BEGIN
  ALTER TABLE transactions ADD COLUMN IF NOT EXISTS source_ref TEXT;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE transactions ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'web';
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE transactions ADD COLUMN IF NOT EXISTS ingest_source_id UUID;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE transactions ADD COLUMN IF NOT EXISTS corroborated_by JSONB DEFAULT '[]'::jsonb;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE transactions ADD COLUMN IF NOT EXISTS raw_input TEXT;
EXCEPTION WHEN others THEN NULL;
END $$;

-- Index for idempotency by source_ref
CREATE INDEX IF NOT EXISTS transactions_source_ref_idx
  ON transactions(user_id, source_ref)
  WHERE source_ref IS NOT NULL;

-- Index for cross-channel dedup
CREATE INDEX IF NOT EXISTS transactions_dedup_idx
  ON transactions(user_id, account_id, amount, date)
  WHERE deleted_at IS NULL;

-- 2) Create ingest_sources table
CREATE TABLE IF NOT EXISTS ingest_sources (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('email','webhook','notification','csv','form','autopay')),
  api_key_id      UUID REFERENCES api_keys(id) ON DELETE SET NULL,
  trust           TEXT NOT NULL DEFAULT 'review' CHECK (trust IN ('review','auto')),
  parser_name     TEXT,
  total_ok        BIGINT NOT NULL DEFAULT 0,
  total_corrected BIGINT NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ingest_sources_user_id_idx ON ingest_sources(user_id);
CREATE INDEX IF NOT EXISTS ingest_sources_kind_idx      ON ingest_sources(kind);
