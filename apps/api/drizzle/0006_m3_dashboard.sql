-- M3 Dashboard: query-supporting indexes for dynamic summaries.
-- Dashboard data is computed from transactions to stay current without snapshots.
CREATE INDEX IF NOT EXISTS "transactions_dashboard_user_type_date_idx"
  ON "transactions" ("user_id", "type", "date")
  WHERE "deleted_at" IS NULL;

CREATE INDEX IF NOT EXISTS "transactions_dashboard_user_category_date_idx"
  ON "transactions" ("user_id", "category_id", "date")
  WHERE "deleted_at" IS NULL AND "type" = 'expense';
