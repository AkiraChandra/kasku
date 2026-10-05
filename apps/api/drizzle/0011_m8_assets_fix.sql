-- M8: Ensure assets table has all required columns
ALTER TABLE assets ADD COLUMN IF NOT EXISTS is_archived boolean DEFAULT false;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS unit varchar(50);
ALTER TABLE assets ADD COLUMN IF NOT EXISTS quantity bigint CHECK (quantity >= 0);
ALTER TABLE assets ADD COLUMN IF NOT EXISTS cost_basis bigint DEFAULT 0 CHECK (cost_basis >= 0);
ALTER TABLE assets ADD COLUMN IF NOT EXISTS is_liquid boolean DEFAULT false;
