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
\t"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
\t"org_id" uuid NOT NULL REFERENCES "orgs"("id") ON DELETE CASCADE,
\t"phone_number_id" text NOT NULL,
\t"business_account_id" text,
\t"access_token_cipher" text NOT NULL,
\t"app_secret_cipher" text NOT NULL,
\t"verify_token_cipher" text NOT NULL,
\t"enabled" boolean DEFAULT true NOT NULL,
\t"media_retention_days" integer DEFAULT 30 NOT NULL,
\t"created_at" timestamp with time zone DEFAULT now() NOT NULL,
\t"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_configs_org_idx" ON "whatsapp_configs" ("org_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "conversations" (
\t"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
\t"org_id" uuid NOT NULL REFERENCES "orgs"("id") ON DELETE CASCADE,
\t"channel" "conversation_channel" DEFAULT 'whatsapp' NOT NULL,
\t"external_id" text NOT NULL,
\t"participant_phone" text NOT NULL,
\t"display_name" text,
\t"language" text DEFAULT 'en' NOT NULL,
\t"state" "conversation_state" DEFAULT 'open' NOT NULL,
\t"customer_id" uuid REFERENCES "customers"("id") ON DELETE SET NULL,
\t"last_message_at" timestamp with time zone,
\t"last_customer_message_at" timestamp with time zone,
\t"follow_up_count" integer DEFAULT 0 NOT NULL,
\t"needs_template" boolean DEFAULT false NOT NULL,
\t"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
\t"created_at" timestamp with time zone DEFAULT now() NOT NULL,
\t"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "conversations_org_external_idx" ON "conversations" ("org_id", "channel", "external_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversations_org_phone_idx" ON "conversations" ("org_id", "participant_phone");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversations_org_last_message_idx" ON "conversations" ("org_id", "last_message_at");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "messages" (
\t"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
\t"org_id" uuid NOT NULL REFERENCES "orgs"("id") ON DELETE CASCADE,
\t"conversation_id" uuid NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
\t"external_id" text,
\t"direction" "message_direction" NOT NULL,
\t"from_address" text,
\t"to_address" text,
\t"text" text,
\t"transcript" text,
\t"language" text,
\t"safety_flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
\t"media" jsonb DEFAULT '[]'::jsonb NOT NULL,
\t"follow_up_index" integer,
\t"raw_payload" jsonb,
\t"sent_at" timestamp with time zone,
\t"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "messages_org_external_idx" ON "messages" ("org_id", "external_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_conversation_created_idx" ON "messages" ("conversation_id", "created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_org_sender_created_idx" ON "messages" ("org_id", "from_address", "created_at");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_media" (
\t"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
\t"org_id" uuid NOT NULL REFERENCES "orgs"("id") ON DELETE CASCADE,
\t"message_id" uuid NOT NULL REFERENCES "messages"("id") ON DELETE CASCADE,
\t"job_id" uuid REFERENCES "jobs"("id") ON DELETE SET NULL,
\t"kind" text NOT NULL,
\t"object_key" text NOT NULL,
\t"content_type" text NOT NULL,
\t"file_name" text,
\t"byte_size" integer NOT NULL,
\t"wa_media_id" text,
\t"sha256" text,
\t"expires_at" timestamp with time zone NOT NULL,
\t"attached_at" timestamp with time zone,
\t"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_media_job_idx" ON "agent_media" ("job_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_media_expiry_idx" ON "agent_media" ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_media_message_idx" ON "agent_media" ("message_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_runs" (
\t"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
\t"org_id" uuid NOT NULL REFERENCES "orgs"("id") ON DELETE CASCADE,
\t"conversation_id" uuid REFERENCES "conversations"("id") ON DELETE SET NULL,
\t"message_id" uuid REFERENCES "messages"("id") ON DELETE SET NULL,
\t"job_id" uuid REFERENCES "jobs"("id") ON DELETE SET NULL,
\t"state" "agent_run_state" DEFAULT 'pending' NOT NULL,
\t"task" text NOT NULL,
\t"input" jsonb NOT NULL,
\t"output" jsonb,
\t"provider" text,
\t"model" text,
\t"latency_ms" integer,
\t"cost_cents" integer DEFAULT 0 NOT NULL,
\t"error" text,
\t"attempts" integer DEFAULT 0 NOT NULL,
\t"created_at" timestamp with time zone DEFAULT now() NOT NULL,
\t"completed_at" timestamp with time zone
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
