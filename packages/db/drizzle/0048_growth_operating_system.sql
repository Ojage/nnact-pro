ALTER TYPE "public"."growth_campaign_status" ADD VALUE IF NOT EXISTS 'RESEARCHING';--> statement-breakpoint
ALTER TYPE "public"."growth_campaign_status" ADD VALUE IF NOT EXISTS 'READY_FOR_REVIEW';--> statement-breakpoint
ALTER TABLE "growth_prospects" ADD COLUMN "sector_slug" text;--> statement-breakpoint
ALTER TABLE "growth_prospects" ADD COLUMN "fit_score" integer;--> statement-breakpoint
ALTER TABLE "growth_prospects" ADD COLUMN "fit_summary" text;--> statement-breakpoint
ALTER TABLE "growth_prospects" ADD COLUMN "fit_evidence" jsonb DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "growth_prospects" ADD COLUMN "email_verification_status" text;--> statement-breakpoint
ALTER TABLE "growth_prospects" ADD COLUMN "last_researched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "growth_prospects" ADD COLUMN "rejected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "growth_prospects" ADD COLUMN "reject_reason" text;--> statement-breakpoint
ALTER TABLE "growth_campaigns" ADD COLUMN "language" text DEFAULT 'EN' NOT NULL;--> statement-breakpoint
ALTER TABLE "growth_campaigns" ADD COLUMN "prospect_selection_rules" jsonb DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "growth_campaigns" ADD COLUMN "offer_summary" text;--> statement-breakpoint
ALTER TABLE "growth_campaigns" ADD COLUMN "business_goal" text;--> statement-breakpoint
ALTER TABLE "growth_campaigns" ADD COLUMN "weekly_limit" integer;--> statement-breakpoint
ALTER TABLE "growth_campaigns" ADD COLUMN "total_contact_cap" integer;--> statement-breakpoint
ALTER TABLE "growth_campaigns" ADD COLUMN "budget_cap_cents" integer;--> statement-breakpoint
ALTER TABLE "growth_campaigns" ALTER COLUMN "timezone" SET DEFAULT 'Africa/Douala';--> statement-breakpoint
ALTER TABLE "growth_campaign_recipients" ADD COLUMN "ab_variant" text;--> statement-breakpoint
ALTER TABLE "growth_outbound_messages" ADD COLUMN "subject_snapshot" text;--> statement-breakpoint
ALTER TABLE "growth_outbound_messages" ADD COLUMN "body_text_snapshot" text;--> statement-breakpoint
ALTER TABLE "growth_outbound_messages" ADD COLUMN "from_email" text;--> statement-breakpoint
ALTER TABLE "growth_outbound_messages" ADD COLUMN "from_display_name" text;--> statement-breakpoint
CREATE TABLE "growth_prospect_discovery_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"sector_slug" text,
	"city" text,
	"country" text,
	"status" text NOT NULL,
	"prospects_seen" integer DEFAULT 0 NOT NULL,
	"prospects_created" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"created_by" uuid
);--> statement-breakpoint
CREATE TABLE "growth_inbox_thread_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"body" text NOT NULL,
	"assigned_to" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "growth_autopilot_simulation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"inputs" jsonb NOT NULL,
	"outputs" jsonb NOT NULL,
	"summary" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "growth_campaign_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"action" text NOT NULL,
	"previous_status" text,
	"new_status" text,
	"note" text,
	"changed_by" uuid,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "growth_prospect_discovery_runs" ADD CONSTRAINT "growth_prospect_discovery_runs_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "growth_prospect_discovery_runs" ADD CONSTRAINT "growth_prospect_discovery_runs_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null;--> statement-breakpoint
ALTER TABLE "growth_inbox_thread_notes" ADD CONSTRAINT "growth_inbox_thread_notes_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "growth_inbox_thread_notes" ADD CONSTRAINT "growth_inbox_thread_notes_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."growth_inbox_threads"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "growth_inbox_thread_notes" ADD CONSTRAINT "growth_inbox_thread_notes_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null;--> statement-breakpoint
ALTER TABLE "growth_autopilot_simulation_runs" ADD CONSTRAINT "growth_autopilot_simulation_runs_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "growth_autopilot_simulation_runs" ADD CONSTRAINT "growth_autopilot_simulation_runs_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null;--> statement-breakpoint
ALTER TABLE "growth_campaign_audit_log" ADD CONSTRAINT "growth_campaign_audit_log_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "growth_campaign_audit_log" ADD CONSTRAINT "growth_campaign_audit_log_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."growth_campaigns"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "growth_campaign_audit_log" ADD CONSTRAINT "growth_campaign_audit_log_changed_by_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE set null;--> statement-breakpoint
CREATE INDEX "growth_prospects_sector_idx" ON "growth_prospects" USING btree ("org_id","sector_slug");--> statement-breakpoint
CREATE INDEX "growth_prospects_fit_idx" ON "growth_prospects" USING btree ("org_id","fit_score");--> statement-breakpoint
CREATE INDEX "growth_prospect_discovery_runs_org_idx" ON "growth_prospect_discovery_runs" USING btree ("org_id","started_at");--> statement-breakpoint
CREATE INDEX "growth_inbox_thread_notes_thread_idx" ON "growth_inbox_thread_notes" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "growth_autopilot_simulation_runs_org_idx" ON "growth_autopilot_simulation_runs" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "growth_campaign_audit_log_campaign_idx" ON "growth_campaign_audit_log" USING btree ("campaign_id","changed_at");
