CREATE TYPE "public"."growth_campaign_purpose" AS ENUM('COLD_OUTREACH', 'PERMISSION_MARKETING', 'EXISTING_CUSTOMER');--> statement-breakpoint
CREATE TYPE "public"."growth_campaign_status" AS ENUM('DRAFT', 'IN_REVIEW', 'APPROVED', 'SCHEDULED', 'RUNNING', 'PAUSED', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."growth_campaign_recipient_status" AS ENUM('PENDING', 'QUEUED', 'SENT', 'REPLIED', 'OPTED_OUT', 'BOUNCED', 'SUPPRESSED', 'BLOCKED', 'SKIPPED', 'CONVERTED');--> statement-breakpoint
CREATE TYPE "public"."growth_outbound_status" AS ENUM('QUEUED', 'SENT', 'FAILED', 'SUPPRESSED', 'BLOCKED');--> statement-breakpoint
CREATE TABLE "growth_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"purpose" "growth_campaign_purpose" DEFAULT 'COLD_OUTREACH' NOT NULL,
	"status" "growth_campaign_status" DEFAULT 'DRAFT' NOT NULL,
	"sender_identity_id" uuid NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"scheduled_start_at" timestamp with time zone,
	"quiet_hours_start" integer DEFAULT 20,
	"quiet_hours_end" integer DEFAULT 8,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"daily_limit" integer DEFAULT 50 NOT NULL,
	"max_follow_ups" integer DEFAULT 2 NOT NULL,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "growth_campaigns_sender_identity_id_fk" FOREIGN KEY ("sender_identity_id") REFERENCES "public"."growth_sender_identities"("id") ON DELETE restrict,
	CONSTRAINT "growth_campaigns_approved_by_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null,
	CONSTRAINT "growth_campaigns_quiet_hours_check" CHECK ("quiet_hours_start" IS NULL OR ("quiet_hours_start" BETWEEN 0 AND 23)),
	CONSTRAINT "growth_campaigns_quiet_hours_end_check" CHECK ("quiet_hours_end" IS NULL OR ("quiet_hours_end" BETWEEN 0 AND 23)),
	CONSTRAINT "growth_campaigns_daily_limit_check" CHECK ("daily_limit" > 0),
	CONSTRAINT "growth_campaigns_max_follow_ups_check" CHECK ("max_follow_ups" >= 0)
);--> statement-breakpoint
CREATE TABLE "growth_campaign_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"step_number" integer NOT NULL,
	"delay_days" integer DEFAULT 0 NOT NULL,
	"subject" text NOT NULL,
	"body_text" text NOT NULL,
	"body_html" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "growth_campaign_steps_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."growth_campaigns"("id") ON DELETE cascade,
	CONSTRAINT "growth_campaign_steps_step_number_check" CHECK ("step_number" >= 1),
	CONSTRAINT "growth_campaign_steps_delay_days_check" CHECK ("delay_days" >= 0)
);--> statement-breakpoint
CREATE TABLE "growth_campaign_recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"prospect_id" uuid NOT NULL,
	"contact_detail_id" uuid NOT NULL,
	"status" "growth_campaign_recipient_status" DEFAULT 'PENDING' NOT NULL,
	"current_step" integer DEFAULT 0 NOT NULL,
	"follow_ups_sent" integer DEFAULT 0 NOT NULL,
	"last_sent_at" timestamp with time zone,
	"replied_at" timestamp with time zone,
	"opted_out_at" timestamp with time zone,
	"bounced_at" timestamp with time zone,
	"meeting_booked_at" timestamp with time zone,
	"manually_stopped_at" timestamp with time zone,
	"converted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "growth_campaign_recipients_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."growth_campaigns"("id") ON DELETE cascade,
	CONSTRAINT "growth_campaign_recipients_prospect_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."growth_prospects"("id") ON DELETE cascade,
	CONSTRAINT "growth_campaign_recipients_contact_detail_id_fk" FOREIGN KEY ("contact_detail_id") REFERENCES "public"."growth_contact_details"("id") ON DELETE cascade,
	CONSTRAINT "growth_campaign_recipients_step_check" CHECK ("current_step" >= 0),
	CONSTRAINT "growth_campaign_recipients_follow_ups_check" CHECK ("follow_ups_sent" >= 0)
);--> statement-breakpoint
CREATE TABLE "growth_outbound_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"step_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"prospect_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"purpose" "growth_campaign_purpose" NOT NULL,
	"transport_id" text NOT NULL,
	"sender_identity_id" uuid NOT NULL,
	"to_email" text NOT NULL,
	"subject" text NOT NULL,
	"status" "growth_outbound_status" DEFAULT 'QUEUED' NOT NULL,
	"provider_message_id" text,
	"blocked_reason" text,
	"error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "growth_outbound_messages_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."growth_campaigns"("id") ON DELETE cascade,
	CONSTRAINT "growth_outbound_messages_step_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."growth_campaign_steps"("id") ON DELETE cascade,
	CONSTRAINT "growth_outbound_messages_recipient_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."growth_campaign_recipients"("id") ON DELETE cascade,
	CONSTRAINT "growth_outbound_messages_prospect_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."growth_prospects"("id") ON DELETE cascade,
	CONSTRAINT "growth_outbound_messages_sender_identity_id_fk" FOREIGN KEY ("sender_identity_id") REFERENCES "public"."growth_sender_identities"("id") ON DELETE restrict
);--> statement-breakpoint
CREATE INDEX "growth_campaigns_org_idx" ON "growth_campaigns" ("org_id");--> statement-breakpoint
CREATE INDEX "growth_campaigns_status_idx" ON "growth_campaigns" ("org_id","status");--> statement-breakpoint
CREATE INDEX "growth_campaigns_sender_idx" ON "growth_campaigns" ("org_id","sender_identity_id");--> statement-breakpoint
CREATE INDEX "growth_campaign_steps_campaign_idx" ON "growth_campaign_steps" ("org_id","campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX "growth_campaign_steps_number_uq" ON "growth_campaign_steps" ("campaign_id","step_number");--> statement-breakpoint
CREATE INDEX "growth_campaign_recipients_campaign_idx" ON "growth_campaign_recipients" ("org_id","campaign_id");--> statement-breakpoint
CREATE INDEX "growth_campaign_recipients_status_idx" ON "growth_campaign_recipients" ("org_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "growth_campaign_recipients_contact_uq" ON "growth_campaign_recipients" ("campaign_id","contact_detail_id");--> statement-breakpoint
CREATE UNIQUE INDEX "growth_outbound_messages_idempotency_uq" ON "growth_outbound_messages" ("org_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "growth_outbound_messages_campaign_idx" ON "growth_outbound_messages" ("org_id","campaign_id");--> statement-breakpoint
CREATE INDEX "growth_outbound_messages_status_idx" ON "growth_outbound_messages" ("org_id","status");--> statement-breakpoint
CREATE INDEX "growth_outbound_messages_sent_at_idx" ON "growth_outbound_messages" ("org_id","sent_at");--> statement-breakpoint
