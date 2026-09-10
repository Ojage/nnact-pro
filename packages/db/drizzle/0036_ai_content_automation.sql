CREATE TYPE "public"."ai_provider" AS ENUM('OPENAI', 'CLAUDE', 'GROK');--> statement-breakpoint
CREATE TYPE "public"."ai_provider_status" AS ENUM('CONNECTED', 'DISCONNECTED', 'INVALID', 'DEGRADED');--> statement-breakpoint
CREATE TYPE "public"."ai_slot" AS ENUM('MORNING', 'EVENING');--> statement-breakpoint
ALTER TABLE "content_media" ADD COLUMN "ai_usage_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "content_media" ADD COLUMN "ai_last_used_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "content_items" ADD COLUMN "ai_metadata" jsonb;--> statement-breakpoint
CREATE TABLE "ai_provider_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"provider" "ai_provider",
	"enabled" boolean DEFAULT false,
	"status" "ai_provider_status" DEFAULT 'DISCONNECTED',
	"api_key_cipher" text,
	"default_text_model" text,
	"default_image_model" text,
	"base_url" text,
	"timeout_ms" integer DEFAULT 30000,
	"priority" integer DEFAULT 100,
	"capabilities" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"options" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_error" text,
	"last_checked_at" timestamp,
	"last_success_at" timestamp,
	"created_at" timestamp,
	"updated_at" timestamp
);--> statement-breakpoint
CREATE TABLE "ai_content_automation" (
	"org_id" uuid PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false,
	"mode" text DEFAULT 'AUTO_PUBLISH_WITH_GUARDRAILS',
	"timezone" text DEFAULT 'Africa/Douala',
	"morning_time" text DEFAULT '08:00',
	"evening_time" text DEFAULT '18:00',
	"enabled_days" text[] DEFAULT '{"MON","TUE","WED","THU","FRI","SAT","SUN"}',
	"channels" text[] DEFAULT '{"WEBSITE","LINKEDIN"}',
	"text_provider_order" text[] DEFAULT '{"CLAUDE","OPENAI","GROK"}',
	"image_provider" text,
	"review_provider" text,
	"reserve_enabled" boolean DEFAULT true,
	"reserve_target" integer DEFAULT 4,
	"quality_threshold" integer DEFAULT 80,
	"catch_up_window_minutes" integer DEFAULT 180,
	"max_retries" integer DEFAULT 2,
	"max_images_per_slot" integer DEFAULT 2,
	"max_ai_calls_per_slot" integer DEFAULT 24,
	"daily_budget_cents" integer DEFAULT 10000,
	"monthly_budget_cents" integer DEFAULT 250000,
	"last_morning_run_at" timestamp,
	"last_evening_run_at" timestamp,
	"last_digest_sent_at" timestamp,
	"updated_at" timestamp
);--> statement-breakpoint
CREATE TABLE "ai_generation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"slot_key" text NOT NULL,
	"slot" "ai_slot",
	"scheduled_date" date,
	"state" text DEFAULT 'SCHEDULED',
	"brief" jsonb DEFAULT '{}'::jsonb,
	"topic" text,
	"angle" text,
	"category_id" text,
	"category_name" text,
	"content_type" text,
	"content_id" uuid,
	"ai_metadata" jsonb DEFAULT '{}'::jsonb,
	"writer_provider" text,
	"review_provider" text,
	"image_provider" text,
	"quality" jsonb,
	"image_source_type" text,
	"canonical_url" text,
	"website_published_at" timestamp,
	"linkedin_published_at" timestamp,
	"reserve_used" boolean DEFAULT false,
	"attempts" integer DEFAULT 0,
	"error" text,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp,
	"updated_at" timestamp,
	CONSTRAINT "ai_generation_runs_slot_key_unique" UNIQUE("slot_key")
);--> statement-breakpoint
CREATE TABLE "ai_usage_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"run_id" uuid,
	"task" text,
	"provider" text,
	"model" text,
	"input_tokens" integer DEFAULT 0,
	"output_tokens" integer DEFAULT 0,
	"image_count" integer DEFAULT 0,
	"latency_ms" integer DEFAULT 0,
	"cost_cents" integer DEFAULT 0,
	"created_at" timestamp
);--> statement-breakpoint
CREATE TABLE "ai_reserve_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"content_id" uuid,
	"topic" text,
	"category_id" text,
	"category_name" text,
	"status" text DEFAULT 'READY',
	"used_at" timestamp,
	"slot_key_used" text,
	"created_at" timestamp,
	"updated_at" timestamp
);--> statement-breakpoint
CREATE TABLE "ai_prompt_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text,
	"version" text,
	"template" text,
	"active" boolean DEFAULT true,
	"updated_at" timestamp,
	"created_at" timestamp
);--> statement-breakpoint
CREATE INDEX "ai_provider_configs_org_idx" ON "ai_provider_configs" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "ai_automation_org_idx" ON "ai_content_automation" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "ai_runs_org_idx" ON "ai_generation_runs" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "ai_runs_state_idx" ON "ai_generation_runs" USING btree ("state");--> statement-breakpoint
CREATE INDEX "ai_runs_slotdate_idx" ON "ai_generation_runs" USING btree ("scheduled_date");--> statement-breakpoint
CREATE INDEX "ai_usage_org_time_idx" ON "ai_usage_records" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_reserve_org_status_idx" ON "ai_reserve_items" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "ai_prompt_templates_org_name_idx" ON "ai_prompt_templates" USING btree ("org_id","name");--> statement-breakpoint
ALTER TABLE "ai_provider_configs" ADD CONSTRAINT "ai_provider_configs_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_content_automation" ADD CONSTRAINT "ai_content_automation_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generation_runs" ADD CONSTRAINT "ai_generation_runs_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generation_runs" ADD CONSTRAINT "ai_generation_runs_content_id_content_items_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_records" ADD CONSTRAINT "ai_usage_records_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_reserve_items" ADD CONSTRAINT "ai_reserve_items_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_reserve_items" ADD CONSTRAINT "ai_reserve_items_content_id_content_items_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_prompt_templates" ADD CONSTRAINT "ai_prompt_templates_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint