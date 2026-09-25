CREATE TYPE "public"."growth_prospect_lifecycle" AS ENUM('NEW', 'RESEARCHING', 'VERIFIED', 'CONTACTED', 'ENGAGED', 'MEETING_BOOKED', 'QUOTED', 'WON', 'LOST', 'DO_NOT_CONTACT');--> statement-breakpoint
CREATE TYPE "public"."growth_prospect_source" AS ENUM('WEBSITE', 'REFERRAL', 'EXISTING_CUSTOMER', 'EVENTS', 'DIRECTORY', 'COLD_RESEARCH', 'IMPORT', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."growth_contact_detail_kind" AS ENUM('EMAIL', 'PHONE', 'WHATSAPP');--> statement-breakpoint
CREATE TYPE "public"."growth_sender_verification_state" AS ENUM('PENDING', 'VERIFIED', 'FAILED', 'REVOKED');--> statement-breakpoint
CREATE TYPE "public"."growth_suppression_scope" AS ENUM('EMAIL', 'DOMAIN', 'PHONE', 'COMPANY');--> statement-breakpoint
CREATE TYPE "public"."growth_suppression_reason" AS ENUM('OPT_OUT', 'HARD_BOUNCE', 'COMPLAINT', 'MANUAL_BLOCK', 'LEGAL_REQUEST', 'PREVIOUS_CUSTOMER_DO_NOT_CONTACT', 'OTHER');--> statement-breakpoint
CREATE TABLE "growth_sender_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"email" text NOT NULL,
	"reply_to_email" text,
	"role_title" text,
	"verification_state" "growth_sender_verification_state" DEFAULT 'PENDING' NOT NULL,
	"verification_method" text,
	"verified_at" timestamp with time zone,
	"cold_approved" boolean DEFAULT false NOT NULL,
	"cold_approved_by" uuid,
	"cold_approved_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "growth_prospects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"company_name" text NOT NULL,
	"website_domain" text,
	"industry" text,
	"city" text,
	"region" text,
	"country" text,
	"equipment_needs" text,
	"lifecycle" "growth_prospect_lifecycle" DEFAULT 'NEW' NOT NULL,
	"source" "growth_prospect_source" DEFAULT 'COLD_RESEARCH' NOT NULL,
	"source_detail" text,
	"notes" text,
	"assigned_to" uuid,
	"linked_customer_id" uuid,
	"merged_into_id" uuid,
	"verified_at" timestamp with time zone,
	"last_contacted_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);--> statement-breakpoint
CREATE TABLE "growth_contact_details" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"prospect_id" uuid NOT NULL,
	"kind" "growth_contact_detail_kind" NOT NULL,
	"label" text,
	"value" text NOT NULL,
	"normalized_value" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"source" text,
	"source_url" text,
	"source_date" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "growth_suppressions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"scope" "growth_suppression_scope" NOT NULL,
	"value" text NOT NULL,
	"normalized_value" text NOT NULL,
	"reason" "growth_suppression_reason" NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "growth_sender_identities" ADD CONSTRAINT "growth_sender_identities_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_sender_identities" ADD CONSTRAINT "growth_sender_identities_cold_approved_by_users_id_fk" FOREIGN KEY ("cold_approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_sender_identities" ADD CONSTRAINT "growth_sender_identities_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_prospects" ADD CONSTRAINT "growth_prospects_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_prospects" ADD CONSTRAINT "growth_prospects_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_prospects" ADD CONSTRAINT "growth_prospects_linked_customer_id_customers_id_fk" FOREIGN KEY ("linked_customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_prospects" ADD CONSTRAINT "growth_prospects_merged_into_id_growth_prospects_id_fk" FOREIGN KEY ("merged_into_id") REFERENCES "public"."growth_prospects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_prospects" ADD CONSTRAINT "growth_prospects_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_contact_details" ADD CONSTRAINT "growth_contact_details_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_contact_details" ADD CONSTRAINT "growth_contact_details_prospect_id_growth_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."growth_prospects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_contact_details" ADD CONSTRAINT "growth_contact_details_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_suppressions" ADD CONSTRAINT "growth_suppressions_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_suppressions" ADD CONSTRAINT "growth_suppressions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "growth_sender_identities_org_idx" ON "growth_sender_identities" ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "growth_sender_identities_org_email_uq" ON "growth_sender_identities" ("org_id", "email");--> statement-breakpoint
CREATE INDEX "growth_sender_identities_active_idx" ON "growth_sender_identities" ("org_id", "is_active");--> statement-breakpoint
CREATE INDEX "growth_prospects_org_idx" ON "growth_prospects" ("org_id");--> statement-breakpoint
CREATE INDEX "growth_prospects_lifecycle_idx" ON "growth_prospects" ("org_id", "lifecycle");--> statement-breakpoint
CREATE INDEX "growth_prospects_domain_idx" ON "growth_prospects" ("org_id", "website_domain");--> statement-breakpoint
CREATE INDEX "growth_prospects_company_idx" ON "growth_prospects" ("org_id", "company_name");--> statement-breakpoint
CREATE INDEX "growth_prospects_assigned_idx" ON "growth_prospects" ("org_id", "assigned_to");--> statement-breakpoint
CREATE INDEX "growth_contact_details_prospect_idx" ON "growth_contact_details" ("prospect_id");--> statement-breakpoint
CREATE INDEX "growth_contact_details_lookup_idx" ON "growth_contact_details" ("org_id", "normalized_value");--> statement-breakpoint
CREATE INDEX "growth_contact_details_kind_idx" ON "growth_contact_details" ("org_id", "kind");--> statement-breakpoint
CREATE UNIQUE INDEX "growth_suppressions_scope_value_uq" ON "growth_suppressions" ("org_id", "scope", "normalized_value");--> statement-breakpoint
CREATE INDEX "growth_suppressions_lookup_idx" ON "growth_suppressions" ("org_id", "normalized_value");
