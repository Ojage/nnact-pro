CREATE TABLE IF NOT EXISTS "copilot_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"job_id" uuid NOT NULL REFERENCES "jobs"("id") ON DELETE cascade,
	"run_id" uuid REFERENCES "agent_runs"("id") ON DELETE set null,
	"state" text DEFAULT 'shadow' NOT NULL,
	"current" integer DEFAULT 1 NOT NULL,
	"shadow" integer DEFAULT 1 NOT NULL,
	"fingerprint" text NOT NULL,
	"summary" text NOT NULL,
	"recommended_actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"draft_reply" text,
	"risks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"missing_information" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confidence" double precision DEFAULT 0 NOT NULL,
	"outcome_reason" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "copilot_suggestions_current_job_idx" ON "copilot_suggestions" ("org_id","job_id") WHERE "current" = 1;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "copilot_suggestions_job_created_idx" ON "copilot_suggestions" ("job_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "copilot_suggestions_org_state_idx" ON "copilot_suggestions" ("org_id","state");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "copilot_suggestions_run_idx" ON "copilot_suggestions" ("run_id");
