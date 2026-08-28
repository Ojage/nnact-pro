-- Backfill columns that were omitted when 0018/0021 were missing from the journal.
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "pricing" jsonb;
--> statement-breakpoint
ALTER TABLE "estimates" ADD COLUMN IF NOT EXISTS "pricing" jsonb;
--> statement-breakpoint
ALTER TABLE "estimate_options" ADD COLUMN IF NOT EXISTS "pricing" jsonb;
--> statement-breakpoint
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "walkthrough_progress"
  jsonb DEFAULT '{}'::jsonb NOT NULL;
