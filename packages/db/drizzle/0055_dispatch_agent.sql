-- Dispatch Agent suggestions. Additive only; assignment writes remain unchanged.
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "town" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "neighborhood" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "landmark" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "zone" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jobs_org_assigned_idx" ON "jobs" ("org_id", "assigned_to", "scheduled_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "appointments_org_technician_starts_idx" ON "appointments" ("org_id", "technician_id", "starts_at");--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "dispatch_suggestion_state" AS ENUM ('shadow', 'shown', 'accepted', 'changed', 'ignored', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "technician_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
	"home_area" text,
	"max_daily_visits" integer DEFAULT 4,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "technician_profiles_org_user_idx" ON "technician_profiles" ("org_id", "user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "technician_profiles_org_area_idx" ON "technician_profiles" ("org_id", "home_area");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "technician_skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"level" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "technician_skills_org_user_idx" ON "technician_skills" ("org_id", "user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "technician_skills_org_name_idx" ON "technician_skills" ("org_id", "name");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "technician_skills_org_user_kind_name_idx" ON "technician_skills" ("org_id", "user_id", "kind", "name");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dispatch_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"job_id" uuid NOT NULL REFERENCES "jobs"("id") ON DELETE cascade,
	"run_id" uuid,
	"state" "dispatch_suggestion_state" DEFAULT 'shadow' NOT NULL,
	"current" integer DEFAULT 1 NOT NULL,
	"shadow" integer DEFAULT 1 NOT NULL,
	"fingerprint" text NOT NULL,
	"candidates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"causes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confidence" double precision DEFAULT 0 NOT NULL,
	"actual_technician_id" uuid REFERENCES "users"("id") ON DELETE set null,
	"outcome_reason" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "dispatch_suggestions_current_job_idx" ON "dispatch_suggestions" ("org_id", "job_id") WHERE "current" = 1;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dispatch_suggestions_job_created_idx" ON "dispatch_suggestions" ("job_id", "created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dispatch_suggestions_org_state_idx" ON "dispatch_suggestions" ("org_id", "state");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dispatch_suggestions_run_idx" ON "dispatch_suggestions" ("run_id");
