CREATE TYPE "public"."growth_competitor_classification" AS ENUM('DIRECT_LOCAL', 'REGIONAL', 'INTERNATIONAL_REFERENCE', 'UNRELATED');--> statement-breakpoint
CREATE TYPE "public"."growth_competitor_review_status" AS ENUM('SUGGESTED', 'APPROVED', 'REJECTED', 'EXCLUDED');--> statement-breakpoint
CREATE TYPE "public"."growth_autopilot_mode" AS ENUM('OBSERVE', 'ASSISTED', 'AUTOPILOT');--> statement-breakpoint
CREATE TABLE "growth_knowledge_facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"fact_key" text NOT NULL,
	"category" text NOT NULL,
	"subject" text NOT NULL,
	"supporting_passage" text,
	"source_type" text NOT NULL,
	"source_url" text,
	"source_document_id" uuid,
	"source_title" text,
	"extracted_at" timestamp with time zone,
	"confidence" integer DEFAULT 0 NOT NULL,
	"provenance" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"manually_corrected" boolean DEFAULT false NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"rejected_reason" text,
	"last_reviewed_at" timestamp with time zone,
	"contradiction_group" text,
	"superseded_by_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "growth_knowledge_ingest_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"source_type" text NOT NULL,
	"source_url" text,
	"source_title" text,
	"status" text NOT NULL,
	"extractor" text NOT NULL,
	"facts_seen" integer DEFAULT 0 NOT NULL,
	"facts_created" integer DEFAULT 0 NOT NULL,
	"facts_skipped" integer DEFAULT 0 NOT NULL,
	"missing_categories" text[] DEFAULT '{}' NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "growth_knowledge_fact_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"fact_id" uuid NOT NULL,
	"action" text NOT NULL,
	"previous_subject" text,
	"new_subject" text,
	"previous_status" text,
	"new_status" text,
	"note" text,
	"changed_by" uuid,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "growth_knowledge_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"title" text NOT NULL,
	"filename" text NOT NULL,
	"mime" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"blob_document_id" uuid,
	"text_content" text,
	"approved_for_knowledge" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "growth_competitors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"website_domain" text,
	"classification" "growth_competitor_classification" DEFAULT 'REGIONAL' NOT NULL,
	"review_status" "growth_competitor_review_status" DEFAULT 'SUGGESTED' NOT NULL,
	"geography" text,
	"services" text,
	"target_customers" text,
	"positioning" text,
	"visible_offers" text,
	"evidence_summary" text,
	"source_urls" text[] DEFAULT '{}' NOT NULL,
	"review_notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "growth_competitor_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"summary" text NOT NULL,
	"comparison" jsonb NOT NULL,
	"source_competitor_ids" uuid[] DEFAULT '{}' NOT NULL,
	"generated_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "growth_sectors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"excluded" boolean DEFAULT false NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"services" text[] DEFAULT '{}' NOT NULL,
	"equipment_types" text[] DEFAULT '{}' NOT NULL,
	"hypotheses" jsonb DEFAULT '[]' NOT NULL,
	"decision_makers" text,
	"prospect_criteria" text,
	"offer_template" text,
	"call_to_action" text,
	"allocation_weight" integer DEFAULT 100 NOT NULL,
	"manual_allocation_override" integer,
	"min_sample_size" integer DEFAULT 30 NOT NULL,
	"observation_days" integer DEFAULT 14 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "growth_sector_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"sector_id" uuid NOT NULL,
	"evidence_type" text NOT NULL,
	"prospect_id" uuid,
	"campaign_id" uuid,
	"recipient_id" uuid,
	"summary" text NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "growth_autopilot_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"mode" "growth_autopilot_mode" DEFAULT 'OBSERVE' NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"paused_at" timestamp with time zone,
	"paused_by" uuid,
	"daily_send_cap" integer DEFAULT 50 NOT NULL,
	"daily_budget_cents" integer DEFAULT 0 NOT NULL,
	"exploration_percent" integer DEFAULT 20 NOT NULL,
	"approved_sector_ids" uuid[] DEFAULT '{}' NOT NULL,
	"approved_sender_ids" uuid[] DEFAULT '{}' NOT NULL,
	"last_cycle_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "growth_autopilot_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"sector_id" uuid,
	"cycle_id" uuid NOT NULL,
	"previous_allocation" integer NOT NULL,
	"new_allocation" integer NOT NULL,
	"reasoning" text NOT NULL,
	"inputs" jsonb NOT NULL,
	"rollback_of_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "growth_inbox_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"prospect_id" uuid NOT NULL,
	"contact_detail_id" uuid,
	"campaign_id" uuid,
	"sender_identity_id" uuid,
	"subject" text,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"needs_human_reply" boolean DEFAULT false NOT NULL,
	"verification_requested_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "growth_inbox_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"direction" text NOT NULL,
	"from_email" text NOT NULL,
	"to_email" text NOT NULL,
	"subject" text,
	"body_text" text NOT NULL,
	"intent" text,
	"classified_at" timestamp with time zone,
	"provider_message_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "growth_reply_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"inbound_message_id" uuid,
	"language" text DEFAULT 'EN' NOT NULL,
	"draft_text" text NOT NULL,
	"context_sources" jsonb DEFAULT '[]' NOT NULL,
	"knowledge_fact_ids" uuid[] DEFAULT '{}' NOT NULL,
	"requires_human" boolean DEFAULT false NOT NULL,
	"human_route_reason" text,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "growth_campaigns" ADD COLUMN "sector_id" uuid;--> statement-breakpoint
ALTER TABLE "growth_campaigns" ADD COLUMN "autopilot_managed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "growth_knowledge_facts" ADD CONSTRAINT "growth_knowledge_facts_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_knowledge_facts" ADD CONSTRAINT "growth_knowledge_facts_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_knowledge_facts" ADD CONSTRAINT "growth_knowledge_facts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_knowledge_ingest_runs" ADD CONSTRAINT "growth_knowledge_ingest_runs_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_knowledge_ingest_runs" ADD CONSTRAINT "growth_knowledge_ingest_runs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_knowledge_fact_revisions" ADD CONSTRAINT "growth_knowledge_fact_revisions_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_knowledge_fact_revisions" ADD CONSTRAINT "growth_knowledge_fact_revisions_fact_id_fk" FOREIGN KEY ("fact_id") REFERENCES "public"."growth_knowledge_facts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_knowledge_fact_revisions" ADD CONSTRAINT "growth_knowledge_fact_revisions_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_knowledge_documents" ADD CONSTRAINT "growth_knowledge_documents_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_knowledge_documents" ADD CONSTRAINT "growth_knowledge_documents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_competitors" ADD CONSTRAINT "growth_competitors_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_competitors" ADD CONSTRAINT "growth_competitors_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_competitor_analyses" ADD CONSTRAINT "growth_competitor_analyses_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_sectors" ADD CONSTRAINT "growth_sectors_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_sector_evidence" ADD CONSTRAINT "growth_sector_evidence_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_sector_evidence" ADD CONSTRAINT "growth_sector_evidence_sector_id_fk" FOREIGN KEY ("sector_id") REFERENCES "public"."growth_sectors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_sector_evidence" ADD CONSTRAINT "growth_sector_evidence_prospect_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."growth_prospects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_sector_evidence" ADD CONSTRAINT "growth_sector_evidence_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."growth_campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_sector_evidence" ADD CONSTRAINT "growth_sector_evidence_recipient_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."growth_campaign_recipients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_autopilot_settings" ADD CONSTRAINT "growth_autopilot_settings_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_autopilot_settings" ADD CONSTRAINT "growth_autopilot_settings_paused_by_users_id_fk" FOREIGN KEY ("paused_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_autopilot_decisions" ADD CONSTRAINT "growth_autopilot_decisions_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_autopilot_decisions" ADD CONSTRAINT "growth_autopilot_decisions_sector_id_fk" FOREIGN KEY ("sector_id") REFERENCES "public"."growth_sectors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_inbox_threads" ADD CONSTRAINT "growth_inbox_threads_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_inbox_threads" ADD CONSTRAINT "growth_inbox_threads_prospect_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."growth_prospects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_inbox_threads" ADD CONSTRAINT "growth_inbox_threads_contact_detail_id_fk" FOREIGN KEY ("contact_detail_id") REFERENCES "public"."growth_contact_details"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_inbox_threads" ADD CONSTRAINT "growth_inbox_threads_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."growth_campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_inbox_threads" ADD CONSTRAINT "growth_inbox_threads_sender_identity_id_fk" FOREIGN KEY ("sender_identity_id") REFERENCES "public"."growth_sender_identities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_inbox_messages" ADD CONSTRAINT "growth_inbox_messages_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_inbox_messages" ADD CONSTRAINT "growth_inbox_messages_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."growth_inbox_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_reply_drafts" ADD CONSTRAINT "growth_reply_drafts_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_reply_drafts" ADD CONSTRAINT "growth_reply_drafts_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."growth_inbox_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_reply_drafts" ADD CONSTRAINT "growth_reply_drafts_inbound_message_id_fk" FOREIGN KEY ("inbound_message_id") REFERENCES "public"."growth_inbox_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_reply_drafts" ADD CONSTRAINT "growth_reply_drafts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "growth_knowledge_facts_org_fact_key_uq" ON "growth_knowledge_facts" USING btree ("org_id","fact_key");--> statement-breakpoint
CREATE INDEX "growth_knowledge_facts_org_status_idx" ON "growth_knowledge_facts" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "growth_knowledge_facts_org_category_idx" ON "growth_knowledge_facts" USING btree ("org_id","category");--> statement-breakpoint
CREATE INDEX "growth_knowledge_facts_contradiction_idx" ON "growth_knowledge_facts" USING btree ("org_id","contradiction_group");--> statement-breakpoint
CREATE INDEX "growth_knowledge_ingest_runs_org_idx" ON "growth_knowledge_ingest_runs" USING btree ("org_id","started_at");--> statement-breakpoint
CREATE INDEX "growth_knowledge_fact_revisions_fact_idx" ON "growth_knowledge_fact_revisions" USING btree ("fact_id","changed_at");--> statement-breakpoint
CREATE INDEX "growth_knowledge_documents_org_idx" ON "growth_knowledge_documents" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "growth_competitors_org_idx" ON "growth_competitors" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "growth_competitors_domain_idx" ON "growth_competitors" USING btree ("org_id","website_domain");--> statement-breakpoint
CREATE INDEX "growth_competitors_status_idx" ON "growth_competitors" USING btree ("org_id","review_status");--> statement-breakpoint
CREATE UNIQUE INDEX "growth_competitor_analyses_org_version_uq" ON "growth_competitor_analyses" USING btree ("org_id","version");--> statement-breakpoint
CREATE INDEX "growth_competitor_analyses_org_idx" ON "growth_competitor_analyses" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "growth_sectors_org_slug_uq" ON "growth_sectors" USING btree ("org_id","slug");--> statement-breakpoint
CREATE INDEX "growth_sectors_org_idx" ON "growth_sectors" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "growth_sector_evidence_sector_idx" ON "growth_sector_evidence" USING btree ("org_id","sector_id","recorded_at");--> statement-breakpoint
CREATE UNIQUE INDEX "growth_autopilot_settings_org_uq" ON "growth_autopilot_settings" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "growth_autopilot_decisions_org_idx" ON "growth_autopilot_decisions" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "growth_autopilot_decisions_cycle_idx" ON "growth_autopilot_decisions" USING btree ("org_id","cycle_id");--> statement-breakpoint
CREATE INDEX "growth_inbox_threads_org_idx" ON "growth_inbox_threads" USING btree ("org_id","last_message_at");--> statement-breakpoint
CREATE INDEX "growth_inbox_threads_prospect_idx" ON "growth_inbox_threads" USING btree ("org_id","prospect_id");--> statement-breakpoint
CREATE INDEX "growth_inbox_messages_thread_idx" ON "growth_inbox_messages" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "growth_reply_drafts_thread_idx" ON "growth_reply_drafts" USING btree ("thread_id","created_at");
