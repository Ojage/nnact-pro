CREATE TYPE "public"."growth_opportunity_stage" AS ENUM('LEAD', 'QUALIFIED', 'MEETING_SCHEDULED', 'SITE_ASSESSMENT', 'ESTIMATE_SENT', 'NEGOTIATION', 'WON', 'LOST');--> statement-breakpoint
CREATE TYPE "public"."growth_meeting_status" AS ENUM('SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');--> statement-breakpoint
ALTER TABLE "growth_outbound_messages" ADD COLUMN "inbox_thread_id" uuid;--> statement-breakpoint
ALTER TABLE "growth_inbox_messages" ADD COLUMN "outbound_message_id" uuid;--> statement-breakpoint
ALTER TABLE "growth_inbox_messages" ADD COLUMN "inbound_dedupe_key" text;--> statement-breakpoint
CREATE TABLE "growth_inbound_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"payload_sha256" text NOT NULL,
	"status" text DEFAULT 'PROCESSED' NOT NULL,
	"error" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "growth_opportunities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"prospect_id" uuid NOT NULL,
	"thread_id" uuid,
	"campaign_id" uuid,
	"recipient_id" uuid,
	"stage" "growth_opportunity_stage" DEFAULT 'LEAD' NOT NULL,
	"title" text NOT NULL,
	"notes" text,
	"linked_customer_id" uuid,
	"linked_job_id" uuid,
	"linked_estimate_id" uuid,
	"linked_service_agreement_id" uuid,
	"lost_reason" text,
	"won_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "growth_meetings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"prospect_id" uuid NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"location" text,
	"status" "growth_meeting_status" DEFAULT 'SCHEDULED' NOT NULL,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "growth_explee_import_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"status" text NOT NULL,
	"rows_seen" integer DEFAULT 0 NOT NULL,
	"rows_imported" integer DEFAULT 0 NOT NULL,
	"rows_skipped" integer DEFAULT 0 NOT NULL,
	"preview_only" boolean DEFAULT true NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"created_by" uuid
);--> statement-breakpoint
ALTER TABLE "growth_inbound_webhook_events" ADD CONSTRAINT "growth_inbound_webhook_events_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_opportunities" ADD CONSTRAINT "growth_opportunities_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_opportunities" ADD CONSTRAINT "growth_opportunities_prospect_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."growth_prospects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_opportunities" ADD CONSTRAINT "growth_opportunities_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."growth_inbox_threads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_opportunities" ADD CONSTRAINT "growth_opportunities_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."growth_campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_opportunities" ADD CONSTRAINT "growth_opportunities_recipient_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."growth_campaign_recipients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_opportunities" ADD CONSTRAINT "growth_opportunities_linked_customer_id_fk" FOREIGN KEY ("linked_customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_opportunities" ADD CONSTRAINT "growth_opportunities_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_meetings" ADD CONSTRAINT "growth_meetings_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_meetings" ADD CONSTRAINT "growth_meetings_opportunity_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."growth_opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_meetings" ADD CONSTRAINT "growth_meetings_prospect_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."growth_prospects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_meetings" ADD CONSTRAINT "growth_meetings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_explee_import_runs" ADD CONSTRAINT "growth_explee_import_runs_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_explee_import_runs" ADD CONSTRAINT "growth_explee_import_runs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_inbox_messages" ADD CONSTRAINT "growth_inbox_messages_outbound_message_id_fk" FOREIGN KEY ("outbound_message_id") REFERENCES "public"."growth_outbound_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "growth_inbound_webhook_events_dedupe_uq" ON "growth_inbound_webhook_events" USING btree ("org_id","provider","external_id");--> statement-breakpoint
CREATE INDEX "growth_inbound_webhook_events_org_idx" ON "growth_inbound_webhook_events" USING btree ("org_id","received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "growth_inbox_messages_inbound_dedupe_uq" ON "growth_inbox_messages" USING btree ("org_id","inbound_dedupe_key");--> statement-breakpoint
CREATE INDEX "growth_opportunities_org_stage_idx" ON "growth_opportunities" USING btree ("org_id","stage");--> statement-breakpoint
CREATE INDEX "growth_opportunities_prospect_idx" ON "growth_opportunities" USING btree ("org_id","prospect_id");--> statement-breakpoint
CREATE INDEX "growth_meetings_org_idx" ON "growth_meetings" USING btree ("org_id","scheduled_at");--> statement-breakpoint
CREATE INDEX "growth_meetings_opportunity_idx" ON "growth_meetings" USING btree ("opportunity_id");--> statement-breakpoint
CREATE INDEX "growth_explee_import_runs_org_idx" ON "growth_explee_import_runs" USING btree ("org_id","started_at");
