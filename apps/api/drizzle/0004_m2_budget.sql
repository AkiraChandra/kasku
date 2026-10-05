-- Migration: M2 Budget (category-based budgets with progress tracking)
-- Scope: add name + updated_at to budgets (0000 created table without them)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'budgets' AND column_name = 'name'
  ) THEN
    ALTER TABLE "budgets" ADD COLUMN "name" text NOT NULL DEFAULT 'Budget';
  END IF;
END$$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'budgets' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE "budgets" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now();
  END IF;
END$$;
