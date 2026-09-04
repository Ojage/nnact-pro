DO $$ BEGIN
 CREATE TYPE "public"."content_type" AS ENUM('ARTICLE', 'MAINTENANCE_TIP', 'FIELD_STORY', 'PROJECT_SHOWCASE', 'ANNOUNCEMENT', 'CAMPAIGN', 'VIDEO', 'SOCIAL_POST');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."content_status" AS ENUM('DRAFT', 'IN_REVIEW', 'APPROVED', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'ARCHIVED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."content_visibility" AS ENUM('PUBLIC', 'UNLISTED', 'PRIVATE');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."publishing_channel" AS ENUM('WEBSITE', 'LINKEDIN', 'FACEBOOK', 'INSTAGRAM');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."channel_publication_status" AS ENUM('DRAFT', 'READY', 'SCHEDULED', 'QUEUED', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."connection_status" AS ENUM('CONNECTED', 'DISCONNECTED', 'EXPIRED', 'ERROR');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE TABLE "content_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "content_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "content_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"content_type" text NOT NULL,
	"file_name" text,
	"alt_text" text,
	"caption" text,
	"approved_for_marketing" boolean DEFAULT false NOT NULL,
	"source" text,
	"photo_id" uuid,
	"uploaded_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "content_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"type" "content_type" NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"summary" text,
	"body" text DEFAULT '' NOT NULL,
	"status" "content_status" DEFAULT 'DRAFT' NOT NULL,
	"visibility" "content_visibility" DEFAULT 'PUBLIC' NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"featured_media_id" uuid,
	"author_id" uuid,
	"category_id" uuid,
	"seo_title" text,
	"seo_description" text,
	"canonical_url" text,
	"open_graph_title" text,
	"open_graph_description" text,
	"open_graph_media_id" uuid,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"scheduled_at" timestamp with time zone,
	"source_job_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "content_item_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"content_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "content_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"content_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"body" text NOT NULL,
	"editor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "channel_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"content_id" uuid NOT NULL,
	"channel" "publishing_channel" NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"title_override" text,
	"body_override" text,
	"caption" text,
	"media_override_id" uuid,
	"link_behavior" text,
	"hashtags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "channel_publication_status" DEFAULT 'DRAFT' NOT NULL,
	"last_generated_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "publishing_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"channel" "publishing_channel" NOT NULL,
	"status" "connection_status" DEFAULT 'DISCONNECTED' NOT NULL,
	"account_name" text,
	"account_id" text,
	"credentials_cipher" text,
	"token_expires_at" timestamp with time zone,
	"last_validated_at" timestamp with time zone,
	"last_error" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "channel_publications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"content_id" uuid NOT NULL,
	"channel" "publishing_channel" NOT NULL,
	"status" "channel_publication_status" DEFAULT 'DRAFT' NOT NULL,
	"provider_publication_id" text,
	"external_url" text,
	"scheduled_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"last_error_code" text,
	"last_error_message" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"idempotency_key" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "publication_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"publication_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"provider_status" text,
	"error_code" text,
	"error_message" text,
	"retryable" boolean DEFAULT false NOT NULL,
	"provider_request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "publication_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"publication_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"processed_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "content_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"content_id" uuid,
	"publication_id" uuid,
	"actor_id" uuid,
	"action" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "content_categories" ADD CONSTRAINT "content_categories_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_tags" ADD CONSTRAINT "content_tags_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_media" ADD CONSTRAINT "content_media_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_media" ADD CONSTRAINT "content_media_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_featured_media_id_content_media_id_fk" FOREIGN KEY ("featured_media_id") REFERENCES "public"."content_media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_category_id_content_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."content_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_open_graph_media_id_content_media_id_fk" FOREIGN KEY ("open_graph_media_id") REFERENCES "public"."content_media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_source_job_id_jobs_id_fk" FOREIGN KEY ("source_job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_item_tags" ADD CONSTRAINT "content_item_tags_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_item_tags" ADD CONSTRAINT "content_item_tags_content_id_content_items_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_item_tags" ADD CONSTRAINT "content_item_tags_tag_id_content_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."content_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_versions" ADD CONSTRAINT "content_versions_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_versions" ADD CONSTRAINT "content_versions_content_id_content_items_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_versions" ADD CONSTRAINT "content_versions_editor_id_users_id_fk" FOREIGN KEY ("editor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_variants" ADD CONSTRAINT "channel_variants_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_variants" ADD CONSTRAINT "channel_variants_content_id_content_items_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_variants" ADD CONSTRAINT "channel_variants_media_override_id_content_media_id_fk" FOREIGN KEY ("media_override_id") REFERENCES "public"."content_media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publishing_connections" ADD CONSTRAINT "publishing_connections_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_publications" ADD CONSTRAINT "channel_publications_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_publications" ADD CONSTRAINT "channel_publications_content_id_content_items_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_attempts" ADD CONSTRAINT "publication_attempts_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_attempts" ADD CONSTRAINT "publication_attempts_publication_id_channel_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."channel_publications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_outbox" ADD CONSTRAINT "publication_outbox_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_outbox" ADD CONSTRAINT "publication_outbox_publication_id_channel_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."channel_publications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_audit_log" ADD CONSTRAINT "content_audit_log_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_audit_log" ADD CONSTRAINT "content_audit_log_content_id_content_items_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_audit_log" ADD CONSTRAINT "content_audit_log_publication_id_channel_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."channel_publications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_audit_log" ADD CONSTRAINT "content_audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "content_categories_org_slug_idx" ON "content_categories" USING btree ("org_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "content_tags_org_slug_idx" ON "content_tags" USING btree ("org_id","slug");--> statement-breakpoint
CREATE INDEX "content_media_org_idx" ON "content_media" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "content_items_org_slug_idx" ON "content_items" USING btree ("org_id","slug");--> statement-breakpoint
CREATE INDEX "content_items_org_status_idx" ON "content_items" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "content_items_org_published_idx" ON "content_items" USING btree ("org_id","published_at");--> statement-breakpoint
CREATE UNIQUE INDEX "content_item_tags_pair_idx" ON "content_item_tags" USING btree ("content_id","tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "content_versions_content_version_idx" ON "content_versions" USING btree ("content_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "channel_variants_content_channel_idx" ON "channel_variants" USING btree ("content_id","channel");--> statement-breakpoint
CREATE UNIQUE INDEX "publishing_connections_org_channel_idx" ON "publishing_connections" USING btree ("org_id","channel");--> statement-breakpoint
CREATE UNIQUE INDEX "channel_publications_content_channel_idx" ON "channel_publications" USING btree ("content_id","channel");--> statement-breakpoint
CREATE INDEX "channel_publications_org_status_idx" ON "channel_publications" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "channel_publications_scheduled_idx" ON "channel_publications" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE UNIQUE INDEX "channel_publications_idempotency_idx" ON "channel_publications" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "publication_attempts_publication_idx" ON "publication_attempts" USING btree ("publication_id");--> statement-breakpoint
CREATE INDEX "publication_outbox_retry_idx" ON "publication_outbox" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "content_audit_log_content_idx" ON "content_audit_log" USING btree ("org_id","content_id");
