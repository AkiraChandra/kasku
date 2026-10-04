DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'transactions' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE "transactions" ADD COLUMN "deleted_at" timestamp with time zone;
  END IF;
END$$;
CREATE INDEX IF NOT EXISTS "transactions_user_deleted_date_idx"
  ON "transactions" USING btree ("user_id", "deleted_at", "date");
