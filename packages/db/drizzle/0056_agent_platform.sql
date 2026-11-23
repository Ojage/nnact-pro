ALTER TABLE "agent_runs" ADD COLUMN IF NOT EXISTS "agent_id" text;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN IF NOT EXISTS "prompt_version" text;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN IF NOT EXISTS "input_tokens" integer;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN IF NOT EXISTS "output_tokens" integer;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN IF NOT EXISTS "outcome" text;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN IF NOT EXISTS "lease_id" uuid;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_leases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" text NOT NULL,
	"org_id" uuid,
	"lease_key" text NOT NULL,
	"state" text DEFAULT 'leased' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"claimed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "agent_leases_agent_key_idx" ON "agent_leases" ("agent_id", "lease_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_leases_expiry_idx" ON "agent_leases" ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_leases_agent_state_idx" ON "agent_leases" ("agent_id", "state");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_dead_letters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" text NOT NULL,
	"org_id" uuid,
	"lease_key" text,
	"run_id" uuid,
	"task" text NOT NULL,
	"error" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_dead_letters_agent_created_idx" ON "agent_dead_letters" ("agent_id", "created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_dead_letters_task_created_idx" ON "agent_dead_letters" ("task", "created_at");
