-- Repair legacy databases that recorded 0005 before the Hutang schema was finalized.
-- Safe to rerun: all structural changes are conditional/idempotent.
DO $$ BEGIN
  IF to_regclass('public.debts') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE debts ADD COLUMN IF NOT EXISTS person_name text NOT NULL DEFAULT '';
  ALTER TABLE debts ADD COLUMN IF NOT EXISTS amount bigint;
  ALTER TABLE debts ADD COLUMN IF NOT EXISTS description text;
  ALTER TABLE debts ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'debts' AND column_name = 'original_amount') THEN
    EXECUTE 'UPDATE debts SET amount = COALESCE(amount, original_amount) WHERE amount IS NULL';
  END IF;
  UPDATE debts SET person_name = COALESCE(person_name, '') WHERE person_name IS NULL;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'debts' AND column_name = 'note') THEN
    EXECUTE 'UPDATE debts SET description = note WHERE description IS NULL';
  END IF;
  ALTER TABLE debts ALTER COLUMN amount SET NOT NULL;

  ALTER TABLE debts DROP CONSTRAINT IF EXISTS debts_type_check;
  ALTER TABLE debts DROP CONSTRAINT IF EXISTS debts_status_check;

  IF EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'debt_type' AND e.enumlabel = 'lent'
  ) THEN
    CREATE TYPE debt_type_v2 AS ENUM ('lent_out', 'borrowed');
    ALTER TABLE debts ALTER COLUMN type DROP DEFAULT;
    ALTER TABLE debts ALTER COLUMN type TYPE text USING type::text;
    UPDATE debts SET type = 'lent_out' WHERE type = 'lent';
    ALTER TABLE debts ALTER COLUMN type TYPE debt_type_v2 USING type::debt_type_v2;
    DROP TYPE debt_type;
    ALTER TYPE debt_type_v2 RENAME TO debt_type;
    ALTER TABLE debts ALTER COLUMN type SET DEFAULT 'lent_out'::debt_type;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'debt_status' AND e.enumlabel = 'written_off'
  ) THEN
    CREATE TYPE debt_status_v2 AS ENUM ('active', 'settled', 'cancelled');
    ALTER TABLE debts ALTER COLUMN status DROP DEFAULT;
    ALTER TABLE debts ALTER COLUMN status TYPE text USING status::text;
    UPDATE debts SET status = 'cancelled' WHERE status = 'written_off';
    ALTER TABLE debts ALTER COLUMN status TYPE debt_status_v2 USING status::debt_status_v2;
    DROP TYPE debt_status;
    ALTER TYPE debt_status_v2 RENAME TO debt_status;
    ALTER TABLE debts ALTER COLUMN status SET DEFAULT 'active'::debt_status;
  END IF;

  ALTER TABLE debts DROP COLUMN IF EXISTS original_amount;
  ALTER TABLE debts DROP COLUMN IF EXISTS note;
END $$;

CREATE INDEX IF NOT EXISTS debts_user_id_idx ON debts(user_id);
CREATE INDEX IF NOT EXISTS debts_status_idx ON debts(status);

CREATE TABLE IF NOT EXISTS debt_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  debt_id uuid NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
  amount bigint NOT NULL CHECK (amount > 0),
  note text,
  paid_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS debt_payments_user_id_idx ON debt_payments(user_id);
CREATE INDEX IF NOT EXISTS debt_payments_debt_id_idx ON debt_payments(debt_id);
