-- Guided-walkthrough progress: per-user, server-authoritative.
-- Keyed by walkthrough id (see packages/shared/src/walkthroughs.ts).
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "walkthrough_progress"
  jsonb DEFAULT '{}'::jsonb NOT NULL;