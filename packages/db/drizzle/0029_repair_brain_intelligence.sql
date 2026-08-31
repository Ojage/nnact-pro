-- Repair Brain intelligence: tags, usage/vote counters, and recency tracking.
ALTER TABLE "known_faults"
  ADD COLUMN IF NOT EXISTS "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  ADD COLUMN IF NOT EXISTS "useful_count" integer DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS "last_used_at" timestamp with time zone;

ALTER TABLE "repair_procedures"
  ADD COLUMN IF NOT EXISTS "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  ADD COLUMN IF NOT EXISTS "useful_count" integer DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS "last_used_at" timestamp with time zone;

ALTER TABLE "model_parts"
  ADD COLUMN IF NOT EXISTS "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  ADD COLUMN IF NOT EXISTS "useful_count" integer DEFAULT 0 NOT NULL;

ALTER TABLE "technical_documents"
  ADD COLUMN IF NOT EXISTS "tags" jsonb DEFAULT '[]'::jsonb NOT NULL;

CREATE INDEX IF NOT EXISTS repair_brain_docs_tags_idx ON technical_documents(org_id, tags);
