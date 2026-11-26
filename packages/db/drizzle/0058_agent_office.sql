CREATE TABLE IF NOT EXISTS "agent_heartbeats" (
	"agent_id" text NOT NULL,
	"instance_id" text NOT NULL,
	"status" text NOT NULL,
	"current_run_id" uuid,
	"current_task" text,
	"current_label" text,
	"step_name" text,
	"step_index" integer DEFAULT 0 NOT NULL,
	"step_count" integer DEFAULT 0 NOT NULL,
	"run_started_at" timestamp with time zone,
	"version" text,
	"prompt_version" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_heartbeats_agent_id_instance_id_pk" PRIMARY KEY("agent_id","instance_id")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_heartbeats_last_seen_idx" ON "agent_heartbeats" ("last_seen_at");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_run_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"agent_id" text NOT NULL,
	"run_id" uuid NOT NULL REFERENCES "agent_runs"("id") ON DELETE cascade,
	"seq" integer NOT NULL,
	"name" text NOT NULL,
	"label" text NOT NULL,
	"status" "agent_run_state" DEFAULT 'running' NOT NULL,
	"summary" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "agent_run_steps_run_seq_idx" ON "agent_run_steps" ("run_id","seq");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_run_steps_created_idx" ON "agent_run_steps" ("created_at");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_log_lines" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"org_id" uuid,
	"agent_id" text NOT NULL,
	"run_id" uuid,
	"level" text NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_log_lines_agent_id_idx" ON "agent_log_lines" ("agent_id","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_log_lines_run_id_idx" ON "agent_log_lines" ("run_id","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_log_lines_created_idx" ON "agent_log_lines" ("created_at");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_office_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"org_id" uuid,
	"agent_id" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_office_events_created_idx" ON "agent_office_events" ("created_at");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"agent_id" text NOT NULL,
	"run_id" uuid,
	"action" text NOT NULL,
	"reason" text,
	"actor_user_id" text,
	"actor_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_audit_log_agent_created_idx" ON "agent_audit_log" ("agent_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_runs_agent_created_idx" ON "agent_runs" ("agent_id","created_at");--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "agent_draft_edited" boolean;
