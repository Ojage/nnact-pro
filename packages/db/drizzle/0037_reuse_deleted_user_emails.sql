-- Email reuse for soft-deleted team members.
-- The original global unique index applies to every users row, including
-- soft-deleted (active=false) accounts, so re-adding a deleted member's email
-- returned a 500 (duplicate key) after the app-level checks were relaxed to
-- only consider active users. Scope the constraint to active accounts only.
DROP INDEX IF EXISTS "users_email_global_idx";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_global_idx" ON "users" (lower("email")) WHERE "active";--> statement-breakpoint