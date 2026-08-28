-- Customer "request a service" flow: structured submission fields on jobs,
-- a submission source flag, and a hashed customer-facing tracking token.
ALTER TABLE "jobs" ADD COLUMN "source" text DEFAULT 'staff' NOT NULL;
ALTER TABLE "jobs" ADD COLUMN "service_category" text;
ALTER TABLE "jobs" ADD COLUMN "service_address" text;
ALTER TABLE "jobs" ADD COLUMN "preferred_date" text;
ALTER TABLE "jobs" ADD COLUMN "preferred_time" text;
ALTER TABLE "jobs" ADD COLUMN "tracking_token_hash" text;

CREATE UNIQUE INDEX IF NOT EXISTS jobs_tracking_hash_idx ON jobs(tracking_token_hash);