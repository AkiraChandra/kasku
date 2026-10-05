-- M4 Hutang/piutang. Safe for fresh and legacy databases.
-- Legacy 0000 created debts with enum values and original_amount/note columns;
-- normalize those columns before adding the requested API shape.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'debt_type') THEN
    CREATE TYPE debt_type AS ENUM ('lent_out', 'borrowed');
  ELSIF to_regclass('public.debts') IS NOT NULL THEN
    CREATE TYPE debt_type_v2 AS ENUM ('lent_out', 'borrowed');
    ALTER TABLE debts ALTER COLUMN type DROP DEFAULT;
    ALTER TABLE debts ALTER COLUMN type TYPE text USING type::text;
    UPDATE debts SET type = 'lent_out' WHERE type = 'lent';
    ALTER TABLE debts ALTER COLUMN type TYPE debt_type_v2 USING type::debt_type_v2;
    DROP TYPE debt_type;
    ALTER TYPE debt_type_v2 RENAME TO debt_type;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'debt_status') THEN
    CREATE TYPE debt_status AS ENUM ('active', 'settled', 'cancelled');
  ELSIF to_regclass('public.debts') IS NOT NULL THEN
    CREATE TYPE debt_status_v2 AS ENUM ('active', 'settled', 'cancelled');
    ALTER TABLE debts ALTER COLUMN status DROP DEFAULT;
    ALTER TABLE debts ALTER COLUMN status TYPE text USING status::text;
    UPDATE debts SET status = 'cancelled' WHERE status = 'written_off';
    ALTER TABLE debts ALTER COLUMN status TYPE debt_status_v2 USING status::debt_status_v2;
    DROP TYPE debt_status;
    ALTER TYPE debt_status_v2 RENAME TO debt_status;
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.debts') IS NULL THEN
    CREATE TABLE debts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
      type debt_type NOT NULL,
      person_name text NOT NULL,
      amount bigint NOT NULL CHECK (amount > 0),
      remaining_amount bigint NOT NULL CHECK (remaining_amount >= 0),
      due_date timestamptz,
      description text,
      status debt_status NOT NULL DEFAULT 'active',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  ELSE
    ALTER TABLE debts ADD COLUMN IF NOT EXISTS person_name text NOT NULL DEFAULT '';
    ALTER TABLE debts ADD COLUMN IF NOT EXISTS amount bigint;
    ALTER TABLE debts ADD COLUMN IF NOT EXISTS description text;
    ALTER TABLE debts ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'debts' AND column_name = 'original_amount') THEN
      EXECUTE 'UPDATE debts SET amount = COALESCE(amount, original_amount) WHERE amount IS NULL';
    END IF;
    UPDATE debts SET person_name = COALESCE(person_name, '') WHERE person_name IS NULL;
    ALTER TABLE debts ALTER COLUMN amount SET NOT NULL;
    ALTER TABLE debts DROP CONSTRAINT IF EXISTS debts_type_check;
    ALTER TABLE debts DROP CONSTRAINT IF EXISTS debts_status_check;
    ALTER TABLE debts ALTER COLUMN type TYPE text USING type::text;
    ALTER TABLE debts ALTER COLUMN status TYPE text USING status::text;
    UPDATE debts SET type = 'lent_out' WHERE type = 'lent';
    UPDATE debts SET status = 'cancelled' WHERE status = 'written_off';
    ALTER TABLE debts ALTER COLUMN type TYPE debt_type USING type::debt_type;
    ALTER TABLE debts ALTER COLUMN status TYPE debt_status USING status::debt_status;
    ALTER TABLE debts ALTER COLUMN type SET DEFAULT 'lent_out'::debt_type;
    ALTER TABLE debts ALTER COLUMN status SET DEFAULT 'active'::debt_status;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'debts' AND column_name = 'note') THEN
      EXECUTE 'UPDATE debts SET description = note WHERE description IS NULL';
    END IF;
    ALTER TABLE debts DROP COLUMN IF EXISTS original_amount;
    ALTER TABLE debts DROP COLUMN IF EXISTS note;
  END IF;
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
