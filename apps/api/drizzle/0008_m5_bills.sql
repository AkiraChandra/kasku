-- M5: Bills & Reminders
-- Idempotent: uses IF NOT EXISTS, CREATE INDEX IF NOT EXISTS

-- bills: add missing columns to existing table
ALTER TABLE bills ADD COLUMN IF NOT EXISTS amount_type text DEFAULT 'fixed'
  CHECK (amount_type IS NULL OR amount_type IN ('fixed','variable'));
ALTER TABLE bills ADD COLUMN IF NOT EXISTS recurrence text DEFAULT 'monthly'
  CHECK (recurrence IS NULL OR recurrence IN ('weekly','monthly','quarterly','yearly'));
ALTER TABLE bills ADD COLUMN IF NOT EXISTS due_day integer CHECK (due_day IS NULL OR (due_day >= 1 AND due_day <= 31));
ALTER TABLE bills ADD COLUMN IF NOT EXISTS notes text;

CREATE INDEX IF NOT EXISTS bills_user_id_idx ON bills(user_id);
CREATE INDEX IF NOT EXISTS bills_next_due_date_idx ON bills(next_due_date);
CREATE INDEX IF NOT EXISTS bills_is_active_idx ON bills(is_active);

-- bill_occurrences
CREATE TABLE IF NOT EXISTS bill_occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bill_id uuid NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  due_date timestamptz NOT NULL,
  expected_amount bigint NOT NULL CHECK (expected_amount >= 0),
  status text NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming','due','overdue','paid','skipped')),
  transaction_id uuid REFERENCES transactions(id) ON DELETE SET NULL,
  paid_date timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bill_occurrences_user_id_idx ON bill_occurrences(user_id);
CREATE INDEX IF NOT EXISTS bill_occurrences_bill_id_idx ON bill_occurrences(bill_id);
CREATE INDEX IF NOT EXISTS bill_occurrences_due_date_idx ON bill_occurrences(due_date);
CREATE INDEX IF NOT EXISTS bill_occurrences_status_idx ON bill_occurrences(status);

-- reminders
DO $$ BEGIN
  IF to_regclass('public.reminders') IS NULL THEN
    CREATE TABLE reminders (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind text NOT NULL CHECK (kind IN ('bill','debt','budget','custom')),
      ref_type text NOT NULL,
      ref_id uuid,
      title text NOT NULL,
      message text,
      scheduled_for timestamptz NOT NULL,
      status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','failed')),
      sent_at timestamptz,
      created_at timestamptz DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS reminders_user_id_idx ON reminders(user_id);
    CREATE INDEX IF NOT EXISTS reminders_scheduled_for_idx ON reminders(scheduled_for);
    CREATE INDEX IF NOT EXISTS reminders_status_idx ON reminders(status);
  END IF;
END $$;
