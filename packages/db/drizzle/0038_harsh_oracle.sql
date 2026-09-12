CREATE TYPE "public"."equipment_status" AS ENUM('operational', 'requires_attention', 'under_repair', 'offline', 'retired');--> statement-breakpoint
CREATE TYPE "public"."agreement_payment_status" AS ENUM('unpaid', 'partial', 'paid');--> statement-breakpoint
CREATE TYPE "public"."agreement_status" AS ENUM('draft', 'pending_approval', 'active', 'suspended', 'expired', 'canceled', 'renewed');--> statement-breakpoint
CREATE TYPE "public"."billing_frequency" AS ENUM('one_time', 'monthly', 'quarterly', 'semi_annual', 'annual');--> statement-breakpoint
CREATE TYPE "public"."maintenance_frequency" AS ENUM('monthly', 'bi_monthly', 'quarterly', 'every_4_months', 'semi_annual', 'annual', 'custom');--> statement-breakpoint
CREATE TYPE "public"."plan_type" AS ENUM('standard', 'custom');--> statement-breakpoint
CREATE TYPE "public"."pricing_model" AS ENUM('fixed', 'per_asset', 'per_visit', 'custom_quote', 'negotiated');--> statement-breakpoint
CREATE TYPE "public"."renewal_type" AS ENUM('manual', 'automatic');--> statement-breakpoint
CREATE TYPE "public"."schedule_priority" AS ENUM('standard', 'priority', 'high_priority', 'critical');--> statement-breakpoint
CREATE TYPE "public"."plan_status" AS ENUM('draft', 'active', 'inactive', 'archived');--> statement-breakpoint
CREATE TYPE "public"."visit_status" AS ENUM('scheduled', 'confirmed', 'in_progress', 'completed', 'rescheduled', 'canceled', 'missed');--> statement-breakpoint
CREATE TYPE "public"."visit_type" AS ENUM('preventive', 'inspection', 'cleaning', 'performance_testing', 'safety_inspection', 'full_service');--> statement-breakpoint
CREATE TYPE "public"."target_customer_type" AS ENUM('residential', 'landlord', 'small_business', 'commercial', 'industrial', 'institutional');--> statement-breakpoint
CREATE TABLE "service_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "service_checklists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"category_id" uuid,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "service_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"contact_name" text,
	"contact_phone" text,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "service_agreements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"agreement_number" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"plan_id" uuid,
	"plan_name" text NOT NULL,
	"plan_snapshot" jsonb NOT NULL,
	"status" "agreement_status" DEFAULT 'draft' NOT NULL,
	"payment_status" "agreement_payment_status" DEFAULT 'unpaid' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"auto_renew" boolean DEFAULT false NOT NULL,
	"renewal_type" "renewal_type" DEFAULT 'manual' NOT NULL,
	"renewal_reminder_at" timestamp with time zone,
	"visits_included" integer DEFAULT 0 NOT NULL,
	"visits_completed" integer DEFAULT 0 NOT NULL,
	"price_cents" integer DEFAULT 0 NOT NULL,
	"billing_frequency" "billing_frequency" DEFAULT 'annual' NOT NULL,
	"service_location_id" uuid,
	"notes" text,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "service_agreements_number_uniq" UNIQUE("org_id","agreement_number")
);--> statement-breakpoint
CREATE TABLE "service_agreement_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"agreement_id" uuid NOT NULL,
	"equipment_id" uuid NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "service_visits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"visit_number" text NOT NULL,
	"agreement_id" uuid NOT NULL,
	"equipment_id" uuid,
	"job_id" uuid,
	"title" text NOT NULL,
	"visit_type" "visit_type" DEFAULT 'preventive' NOT NULL,
	"status" "visit_status" DEFAULT 'scheduled' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"due_at" timestamp with time zone,
	"arrived_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"technician_id" uuid,
	"activities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"problems_found" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"work_performed" text,
	"parts_used" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"recommendations" text,
	"photos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "service_visits_number_uniq" UNIQUE("org_id","visit_number")
);--> statement-breakpoint
ALTER TABLE "equipment" ADD COLUMN "capacity" text;--> statement-breakpoint
ALTER TABLE "equipment" ADD COLUMN "status" "equipment_status" DEFAULT 'operational' NOT NULL;--> statement-breakpoint
DROP INDEX "service_plans_org_idx";--> statement-breakpoint
ALTER TABLE "service_plans" ADD COLUMN "status" "plan_status" DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE "service_plans" ADD COLUMN "plan_type" "plan_type" DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE "service_plans" ADD COLUMN "code" text;--> statement-breakpoint
ALTER TABLE "service_plans" ADD COLUMN "internal_notes" text;--> statement-breakpoint
ALTER TABLE "service_plans" ADD COLUMN "category_id" uuid;--> statement-breakpoint
ALTER TABLE "service_plans" ADD COLUMN "coverage_categories" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "service_plans" ADD COLUMN "coverage_equipment_types" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "service_plans" ADD COLUMN "target_customer_type" "target_customer_type" DEFAULT 'residential' NOT NULL;--> statement-breakpoint
ALTER TABLE "service_plans" ADD COLUMN "max_covered_assets" integer;--> statement-breakpoint
ALTER TABLE "service_plans" ADD COLUMN "capacity_limits" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "service_plans" ADD COLUMN "pricing_model" "pricing_model" DEFAULT 'fixed' NOT NULL;--> statement-breakpoint
ALTER TABLE "service_plans" ADD COLUMN "billing_frequency" "billing_frequency" DEFAULT 'annual' NOT NULL;--> statement-breakpoint
ALTER TABLE "service_plans" ADD COLUMN "setup_fee_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "service_plans" ADD COLUMN "auto_renew" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "service_plans" ADD COLUMN "renewal_type" "renewal_type" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "service_plans" ADD COLUMN "renewal_reminders" jsonb DEFAULT '[30]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "service_plans" ADD COLUMN "maintenance_frequency" "maintenance_frequency" DEFAULT 'quarterly' NOT NULL;--> statement-breakpoint
ALTER TABLE "service_plans" ADD COLUMN "visits_per_term" integer DEFAULT 4 NOT NULL;--> statement-breakpoint
ALTER TABLE "service_plans" ADD COLUMN "primary_visit_type" "visit_type" DEFAULT 'preventive' NOT NULL;--> statement-breakpoint
ALTER TABLE "service_plans" ADD COLUMN "activities" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "service_plans" ADD COLUMN "checklist_id" uuid;--> statement-breakpoint
ALTER TABLE "service_plans" ADD COLUMN "scheduling_priority" "schedule_priority" DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE "service_plans" ADD COLUMN "target_response_hours" integer;--> statement-breakpoint
ALTER TABLE "service_plans" ADD COLUMN "emergency_callout_allowance" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "service_plans" ADD COLUMN "emergency_callout_coverage" text DEFAULT 'priority_diagnosis_only' NOT NULL;--> statement-breakpoint
ALTER TABLE "service_plans" ADD COLUMN "parts_policy" text DEFAULT 'not_included' NOT NULL;--> statement-breakpoint
ALTER TABLE "service_plans" ADD COLUMN "parts_discount_percent" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "service_plans" ADD COLUMN "parts_allowance_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "service_plans" ADD COLUMN "consumables_policy" text DEFAULT 'not_included' NOT NULL;--> statement-breakpoint
ALTER TABLE "service_plans" ADD COLUMN "transport_included" boolean DEFAULT false NOT NULL;--> statement-breakpoint

-- Backfill the reshaped template columns from their legacy counterparts.
UPDATE "service_plans" SET "status" = CASE WHEN "active" THEN 'active'::plan_status ELSE 'inactive'::plan_status END;--> statement-breakpoint
UPDATE "service_plans" SET "visits_per_term" = "included_visits_per_term";--> statement-breakpoint
UPDATE "service_plans" SET "scheduling_priority" = 'priority'::schedule_priority WHERE "priority_scheduling" = true;--> statement-breakpoint
UPDATE "service_plans" SET "benefits" = COALESCE(
	(SELECT jsonb_agg(jsonb_build_object('key', v, 'label', v, 'custom', true))
		FROM jsonb_array_elements_text("service_plans".benefits) AS v),
	'[]'::jsonb
) WHERE jsonb_typeof("benefits") = 'array';--> statement-breakpoint
ALTER TABLE "service_plans" DROP COLUMN "included_visits_per_term";--> statement-breakpoint
ALTER TABLE "service_plans" DROP COLUMN "priority_scheduling";--> statement-breakpoint
ALTER TABLE "service_plans" DROP COLUMN "active";--> statement-breakpoint
CREATE INDEX "service_plans_org_idx" ON "service_plans" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "service_plans_category_idx" ON "service_plans" USING btree ("org_id","category_id");--> statement-breakpoint
ALTER TABLE "service_plans" ADD CONSTRAINT "service_plans_category_id_service_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."service_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_plans" ADD CONSTRAINT "service_plans_checklist_id_service_checklists_id_fk" FOREIGN KEY ("checklist_id") REFERENCES "public"."service_checklists"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- Migrate existing enrollments into numbered agreements with a config snapshot.
INSERT INTO "service_agreements" (
	"id", "org_id", "agreement_number", "customer_id", "plan_id", "plan_name", "plan_snapshot",
	"status", "payment_status", "starts_at", "ends_at", "auto_renew", "renewal_type",
	"renewal_reminder_at", "visits_included", "visits_completed", "price_cents",
	"billing_frequency", "notes", "version", "updated_at", "created_at", "created_by"
)
SELECT
	csp."id",
	csp."org_id",
	'NNACT-SVC-' || to_char(date_trunc('year', csp."starts_at"), 'YYYY') || '-' || lpad(row_number() OVER (PARTITION BY csp."org_id" ORDER BY csp."created_at")::text, 6, '0'),
	csp."customer_id",
	csp."service_plan_id",
	COALESCE(sp."name", 'Service Plan'),
	jsonb_build_object(
		'planId', sp."id",
		'planName', sp."name",
		'priceCents', COALESCE(sp."price_cents", 0),
		'billingFrequency', COALESCE(sp."billing_frequency", 'annual'),
		'setupFeeCents', COALESCE(sp."setup_fee_cents", 0),
		'termMonths', COALESCE(sp."term_months", 12),
		'autoRenew', COALESCE(sp."auto_renew", false),
		'renewalType', COALESCE(sp."renewal_type", 'manual'),
		'renewalReminders', COALESCE(sp."renewal_reminders", '[30]'::jsonb),
		'maintenanceFrequency', COALESCE(sp."maintenance_frequency", 'quarterly'),
		'visitsPerTerm', COALESCE(sp."visits_per_term", 4),
		'primaryVisitType', COALESCE(sp."primary_visit_type", 'preventive'),
		'activities', COALESCE(sp."activities", '[]'::jsonb),
		'maxCoveredAssets', sp."max_covered_assets",
		'schedulingPriority', COALESCE(sp."scheduling_priority", 'standard'),
		'targetResponseHours', sp."target_response_hours",
		'emergencyCalloutAllowance', COALESCE(sp."emergency_callout_allowance", 0),
		'emergencyCalloutCoverage', COALESCE(sp."emergency_callout_coverage", 'priority_diagnosis_only'),
		'partsPolicy', COALESCE(sp."parts_policy", 'not_included'),
		'partsDiscountPercent', COALESCE(sp."parts_discount_percent", 0),
		'partsAllowanceCents', COALESCE(sp."parts_allowance_cents", 0),
		'consumablesPolicy', COALESCE(sp."consumables_policy", 'not_included'),
		'transportIncluded', COALESCE(sp."transport_included", false),
		'benefits', COALESCE(sp."benefits", '[]'::jsonb)
	),
	CASE csp."status"
		WHEN 'active' THEN 'active'
		WHEN 'paused' THEN 'suspended'
		WHEN 'canceled' THEN 'canceled'
		ELSE 'expired'
	END::agreement_status,
	'unpaid'::agreement_payment_status,
	csp."starts_at",
	COALESCE(csp."renews_at", csp."starts_at" + make_interval(months => COALESCE(sp."term_months", 12))),
	COALESCE(sp."auto_renew", false),
	COALESCE(sp."renewal_type", 'manual'),
	csp."renewal_reminder_at",
	csp."visits_included",
	csp."visits_completed",
	COALESCE(sp."price_cents", 0),
	COALESCE(sp."billing_frequency", 'annual'),
	csp."notes",
	csp."version",
	csp."updated_at",
	csp."created_at",
	NULL
FROM "customer_service_plans" csp
LEFT JOIN "service_plans" sp ON sp."id" = csp."service_plan_id";--> statement-breakpoint

INSERT INTO "service_visits" (
	"org_id", "visit_number", "agreement_id", "equipment_id", "job_id", "title", "visit_type",
	"status", "due_at", "completed_at", "notes", "version", "updated_at", "created_at", "created_by"
)
SELECT
	spv."org_id",
	'VISIT-' || to_char(date_trunc('year', COALESCE(spv."due_at", spv."created_at")), 'YYYY') || '-' || lpad(row_number() OVER (PARTITION BY spv."org_id" ORDER BY spv."created_at")::text, 6, '0'),
	spv."customer_service_plan_id",
	NULL,
	spv."job_id",
	spv."title",
	'preventive'::visit_type,
	CASE spv."status"
		WHEN 'planned' THEN 'scheduled'
		WHEN 'completed' THEN 'completed'
		WHEN 'skipped' THEN 'canceled'
		ELSE 'scheduled'
	END::visit_status,
	spv."due_at",
	spv."completed_at",
	spv."notes",
	spv."version",
	spv."updated_at",
	spv."created_at",
	NULL
FROM "service_plan_visits" spv;--> statement-breakpoint

ALTER TABLE "customer_service_plans" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "service_plan_visits" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "customer_service_plans" CASCADE;--> statement-breakpoint
DROP TABLE "service_plan_visits" CASCADE;--> statement-breakpoint
DROP TYPE "public"."service_plan_status";--> statement-breakpoint
DROP TYPE "public"."service_visit_status";--> statement-breakpoint
ALTER TABLE "service_categories" ADD CONSTRAINT "service_categories_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_checklists" ADD CONSTRAINT "service_checklists_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_checklists" ADD CONSTRAINT "service_checklists_category_id_service_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."service_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_locations" ADD CONSTRAINT "service_locations_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_locations" ADD CONSTRAINT "service_locations_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_agreements" ADD CONSTRAINT "service_agreements_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_agreements" ADD CONSTRAINT "service_agreements_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_agreements" ADD CONSTRAINT "service_agreements_plan_id_service_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."service_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_agreements" ADD CONSTRAINT "service_agreements_service_location_id_service_locations_id_fk" FOREIGN KEY ("service_location_id") REFERENCES "public"."service_locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_agreements" ADD CONSTRAINT "service_agreements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_agreement_assets" ADD CONSTRAINT "service_agreement_assets_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_agreement_assets" ADD CONSTRAINT "service_agreement_assets_agreement_id_service_agreements_id_fk" FOREIGN KEY ("agreement_id") REFERENCES "public"."service_agreements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_agreement_assets" ADD CONSTRAINT "service_agreement_assets_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_visits" ADD CONSTRAINT "service_visits_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_visits" ADD CONSTRAINT "service_visits_agreement_id_service_agreements_id_fk" FOREIGN KEY ("agreement_id") REFERENCES "public"."service_agreements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_visits" ADD CONSTRAINT "service_visits_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_visits" ADD CONSTRAINT "service_visits_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_visits" ADD CONSTRAINT "service_visits_technician_id_users_id_fk" FOREIGN KEY ("technician_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_visits" ADD CONSTRAINT "service_visits_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "service_categories_org_idx" ON "service_categories" USING btree ("org_id","sort_order");--> statement-breakpoint
CREATE INDEX "service_checklists_org_idx" ON "service_checklists" USING btree ("org_id","active");--> statement-breakpoint
CREATE INDEX "service_locations_customer_idx" ON "service_locations" USING btree ("org_id","customer_id","active");--> statement-breakpoint
CREATE INDEX "service_agreements_org_status_idx" ON "service_agreements" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "service_agreements_customer_idx" ON "service_agreements" USING btree ("org_id","customer_id","status");--> statement-breakpoint
CREATE INDEX "service_agreements_plan_idx" ON "service_agreements" USING btree ("org_id","plan_id");--> statement-breakpoint
CREATE INDEX "service_agreement_assets_agreement_idx" ON "service_agreement_assets" USING btree ("org_id","agreement_id");--> statement-breakpoint
CREATE INDEX "service_agreement_assets_equipment_idx" ON "service_agreement_assets" USING btree ("org_id","equipment_id");--> statement-breakpoint
CREATE INDEX "service_visits_agreement_idx" ON "service_visits" USING btree ("org_id","agreement_id","status");--> statement-breakpoint
CREATE INDEX "service_visits_status_idx" ON "service_visits" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "service_visits_due_idx" ON "service_visits" USING btree ("org_id","due_at");--> statement-breakpoint
CREATE INDEX "service_visits_technician_idx" ON "service_visits" USING btree ("org_id","technician_id");--> statement-breakpoint