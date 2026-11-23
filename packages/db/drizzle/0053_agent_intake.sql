-- AI intake: WhatsApp webhook state, media retention, and AI run observability.
-- Enum values are appended last and are not used by DML in this migration:
-- PostgreSQL cannot use an enum value added in the same transaction.
DO $$ BEGIN
  ALTER TYPE "job_status" ADD VALUE IF NOT EXISTS 'draft';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TYPE "user_role" ADD VALUE IF NOT EXISTS 'agent';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "conversation_channel" AS ENUM ('whatsapp');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "message_direction" AS ENUM ('inbound', 'outbound');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "conversation_state" AS ENUM ('open', 'awaiting_customer', 'needs_choice', 'needs_template', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "agent_run_state" AS ENUM ('pending', 'running', 'completed', 'failed', 'skipped');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "whatsapp_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL REFERENCES "orgs"("id") ON DELETE CASCADE,
	"phone_number_id" text NOT NULL,
	"business_account_id" text,
	"access_token_cipher" text NOT NULL,
	"app_secret_cipher" text NOT NULL,
	"verify_token_cipher" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"media_retention_days" integer DEFAULT 30 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_configs_org_idx" ON "whatsapp_configs" ("org_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL REFERENCES "orgs"("id") ON DELETE CASCADE,
	"channel" "conversation_channel" DEFAULT 'whatsapp' NOT NULL,
	"external_id" text NOT NULL,
	"participant_phone" text NOT NULL,
	"display_name" text,
	"language" text DEFAULT 'en' NOT NULL,
	"state" "conversation_state" DEFAULT 'open' NOT NULL,
	"customer_id" uuid REFERENCES "customers"("id") ON DELETE SET NULL,
	"last_message_at" timestamp with time zone,
	"last_customer_message_at" timestamp with time zone,
	"follow_up_count" integer DEFAULT 0 NOT NULL,
	"needs_template" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "conversations_org_external_idx" ON "conversations" ("org_id", "channel", "external_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversations_org_phone_idx" ON "conversations" ("org_id", "participant_phone");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversations_org_last_message_idx" ON "conversations" ("org_id", "last_message_at");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL REFERENCES "orgs"("id") ON DELETE CASCADE,
	"conversation_id" uuid NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
	"external_id" text,
	"direction" "message_direction" NOT NULL,
	"from_address" text,
	"to_address" text,
	"text" text,
	"transcript" text,
	"language" text,
	"safety_flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"media" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"follow_up_index" integer,
	"raw_payload" jsonb,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "messages_org_external_idx" ON "messages" ("org_id", "external_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_conversation_created_idx" ON "messages" ("conversation_id", "created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_org_sender_created_idx" ON "messages" ("org_id", "from_address", "created_at");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL REFERENCES "orgs"("id") ON DELETE CASCADE,
	"message_id" uuid NOT NULL REFERENCES "messages"("id") ON DELETE CASCADE,
	"job_id" uuid REFERENCES "jobs"("id") ON DELETE SET NULL,
	"kind" text NOT NULL,
	"object_key" text NOT NULL,
	"content_type" text NOT NULL,
	"file_name" text,
	"byte_size" integer NOT NULL,
	"wa_media_id" text,
	"sha256" text,
	"expires_at" timestamp with time zone NOT NULL,
	"attached_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_media_job_idx" ON "agent_media" ("job_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_media_expiry_idx" ON "agent_media" ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_media_message_idx" ON "agent_media" ("message_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL REFERENCES "orgs"("id") ON DELETE CASCADE,
	"conversation_id" uuid REFERENCES "conversations"("id") ON DELETE SET NULL,
	"message_id" uuid REFERENCES "messages"("id") ON DELETE SET NULL,
	"job_id" uuid REFERENCES "jobs"("id") ON DELETE SET NULL,
	"state" "agent_run_state" DEFAULT 'pending' NOT NULL,
	"task" text NOT NULL,
	"input" jsonb NOT NULL,
	"output" jsonb,
	"provider" text,
	"model" text,
	"latency_ms" integer,
	"cost_cents" integer DEFAULT 0 NOT NULL,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_runs_org_task_created_idx" ON "agent_runs" ("org_id", "task", "created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_runs_conversation_idx" ON "agent_runs" ("conversation_id", "created_at");--> statement-breakpoint
-- Drafts intentionally have no job number. The number is allocated on approval
-- by the same per-org advisory lock used for staff-created jobs.
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "agent_draft" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "agent_rejected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "agent_rejection_reason" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "agent_conversation_id" uuid;--> statement-breakpoint
-- Phone matching is deliberately non-unique: two customer records can share a
-- phone, and the dispatcher must be shown both rather than guessing.
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "phone_e164" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customers_org_phone_e164_idx" ON "customers" ("org_id", "phone_e164");--> statement-breakpoint
UPDATE "customers" c
SET "phone_e164" = x.normalized
FROM (
  SELECT "id",
    CASE
      WHEN "phone" IS NULL OR btrim("phone") = '' THEN NULL
      ELSE (
        WITH digits AS (SELECT regexp_replace("phone", '\D', '', 'g') AS d)
        SELECT CASE
          WHEN d LIKE '00237%' THEN '237' || substring(d from 6)
          WHEN length(d) = 9 THEN '237' || d
          WHEN d LIKE '+237%' THEN substring(d from 5)
          ELSE d
        END FROM digits
      )
    END AS normalized
  FROM "customers"
) x
WHERE c."id" = x."id" AND c."phone_e164" IS NULL;
