CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."photo_category" AS ENUM('nameplate', 'before_repair', 'after_repair', 'component', 'board', 'wiring', 'damage', 'measurement', 'part', 'other');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."knowledge_confidence" AS ENUM('unverified', 'field_observation', 'repeated_success', 'technician_verified', 'senior_verified', 'manufacturer_confirmed');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."knowledge_verification_status" AS ENUM('field_note', 'proposed', 'reviewed', 'verified', 'rejected', 'archived');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."knowledge_source_type" AS ENUM('field_job', 'manufacturer', 'supplier', 'internal_research', 'field_observation', 'verified_internal');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."repair_outcome_status" AS ENUM('successful', 'partial', 'failed', 'temporary_fix', 'waiting_for_part', 'customer_declined', 'replacement_recommended', 'unrepairable');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."technical_document_type" AS ENUM('service_manual', 'user_manual', 'wiring_diagram', 'schematic', 'datasheet', 'board_image', 'exploded_view', 'internal_report', 'field_note', 'video', 'audio', 'supplier_document');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."measurement_result" AS ENUM('pass', 'fail', 'unknown', 'within_range', 'out_of_range');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."knowledge_proposal_type" AS ENUM('fault', 'symptom', 'diagnostic_procedure', 'repair_procedure', 'part', 'measurement', 'test_point', 'document');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."knowledge_proposal_status" AS ENUM('field_note', 'proposed', 'reviewed', 'verified', 'rejected');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN IF NOT EXISTS "category" "photo_category" DEFAULT 'other' NOT NULL;
--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN IF NOT EXISTS "equipment_id" uuid;
--> statement-breakpoint
ALTER TABLE "equipment" ADD COLUMN IF NOT EXISTS "property_id" uuid;
--> statement-breakpoint
ALTER TABLE "equipment" ADD COLUMN IF NOT EXISTS "equipment_model_id" uuid;
--> statement-breakpoint
ALTER TABLE "equipment" ADD COLUMN IF NOT EXISTS "asset_tag" text;
--> statement-breakpoint
ALTER TABLE "equipment" ADD COLUMN IF NOT EXISTS "condition" text;
--> statement-breakpoint
ALTER TABLE "equipment" ADD COLUMN IF NOT EXISTS "last_maintenance" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "equipment" ADD COLUMN IF NOT EXISTS "next_maintenance" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "equipment" ADD COLUMN IF NOT EXISTS "nameplate_photo_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'equipment_property_id_properties_id_fk') THEN
  ALTER TABLE "equipment" ADD CONSTRAINT "equipment_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE set null ON UPDATE no action;
 END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "diagnostic_sessions" ADD COLUMN IF NOT EXISTS "known_fault_id" uuid;
--> statement-breakpoint
ALTER TABLE "diagnostic_sessions" ADD COLUMN IF NOT EXISTS "equipment_model_id" uuid;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "equipment_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"manufacturer" text NOT NULL,
	"brand" text,
	"model_number" text NOT NULL,
	"model_name" text,
	"variant" text,
	"category" text NOT NULL,
	"subcategory" text,
	"product_family" text,
	"manufacture_years" jsonb,
	"specifications" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"normalized_identifier" text NOT NULL,
	"notes" text,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'equipment_models_org_id_orgs_id_fk') THEN
  ALTER TABLE "equipment_models" ADD CONSTRAINT "equipment_models_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'equipment_models_created_by_users_id_fk') THEN
  ALTER TABLE "equipment_models" ADD CONSTRAINT "equipment_models_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
 END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'equipment_equipment_model_id_equipment_models_id_fk') THEN
  ALTER TABLE "equipment" ADD CONSTRAINT "equipment_equipment_model_id_equipment_models_id_fk" FOREIGN KEY ("equipment_model_id") REFERENCES "public"."equipment_models"("id") ON DELETE set null ON UPDATE no action;
 END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "equipment_models_org_normalized_idx" ON "equipment_models" USING btree ("org_id","normalized_identifier");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "equipment_models_org_category_idx" ON "equipment_models" USING btree ("org_id","category");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "equipment_models_search_idx" ON "equipment_models" USING btree ("org_id","manufacturer","model_number");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "equipment_model_idx" ON "equipment" USING btree ("org_id","equipment_model_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "equipment_serial_idx" ON "equipment" USING btree ("org_id","serial_number");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "symptoms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"label" text NOT NULL,
	"normalized_label" text NOT NULL,
	"description" text,
	"category" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'symptoms_org_id_orgs_id_fk') THEN
  ALTER TABLE "symptoms" ADD CONSTRAINT "symptoms_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "symptoms_org_normalized_idx" ON "symptoms" USING btree ("org_id","normalized_label");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "known_faults" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"equipment_model_id" uuid NOT NULL,
	"fault_code" text,
	"normalized_fault_code" text,
	"title" text NOT NULL,
	"description" text,
	"severity" text,
	"frequency" text,
	"safety_warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"probable_causes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confidence_status" "knowledge_confidence" DEFAULT 'unverified' NOT NULL,
	"verification_status" "knowledge_verification_status" DEFAULT 'field_note' NOT NULL,
	"source_type" "knowledge_source_type",
	"source_job_id" uuid,
	"source_equipment_id" uuid,
	"created_by" uuid,
	"verified_by" uuid,
	"verified_at" timestamp with time zone,
	"revision" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'known_faults_equipment_model_id_equipment_models_id_fk') THEN
  ALTER TABLE "known_faults" ADD CONSTRAINT "known_faults_equipment_model_id_equipment_models_id_fk" FOREIGN KEY ("equipment_model_id") REFERENCES "public"."equipment_models"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "known_faults_model_idx" ON "known_faults" USING btree ("org_id","equipment_model_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "known_faults_code_idx" ON "known_faults" USING btree ("org_id","normalized_fault_code");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fault_symptoms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"fault_id" uuid NOT NULL,
	"symptom_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fault_symptoms_fault_id_known_faults_id_fk') THEN
  ALTER TABLE "fault_symptoms" ADD CONSTRAINT "fault_symptoms_fault_id_known_faults_id_fk" FOREIGN KEY ("fault_id") REFERENCES "public"."known_faults"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fault_symptoms_symptom_id_symptoms_id_fk') THEN
  ALTER TABLE "fault_symptoms" ADD CONSTRAINT "fault_symptoms_symptom_id_symptoms_id_fk" FOREIGN KEY ("symptom_id") REFERENCES "public"."symptoms"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fault_symptoms_pair_idx" ON "fault_symptoms" USING btree ("fault_id","symptom_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "repair_procedures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"equipment_model_id" uuid NOT NULL,
	"known_fault_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"prerequisites" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"safety_warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"required_tools" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"required_parts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"expected_duration_minutes" integer,
	"skill_level" text,
	"verification_steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confidence_status" "knowledge_confidence" DEFAULT 'unverified' NOT NULL,
	"verification_status" "knowledge_verification_status" DEFAULT 'field_note' NOT NULL,
	"source_type" "knowledge_source_type",
	"source_job_id" uuid,
	"created_by" uuid,
	"verified_by" uuid,
	"verified_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'repair_procedures_equipment_model_id_equipment_models_id_fk') THEN
  ALTER TABLE "repair_procedures" ADD CONSTRAINT "repair_procedures_equipment_model_id_equipment_models_id_fk" FOREIGN KEY ("equipment_model_id") REFERENCES "public"."equipment_models"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'repair_procedures_known_fault_id_known_faults_id_fk') THEN
  ALTER TABLE "repair_procedures" ADD CONSTRAINT "repair_procedures_known_fault_id_known_faults_id_fk" FOREIGN KEY ("known_fault_id") REFERENCES "public"."known_faults"("id") ON DELETE set null ON UPDATE no action;
 END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "repair_procedures_model_idx" ON "repair_procedures" USING btree ("org_id","equipment_model_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "test_points" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"equipment_model_id" uuid NOT NULL,
	"component" text,
	"board" text,
	"connector" text,
	"pin" text,
	"description" text,
	"expected_min" text,
	"expected_max" text,
	"expected_exact" text,
	"unit" text,
	"warning" text,
	"photo_id" uuid,
	"confidence_status" "knowledge_confidence" DEFAULT 'unverified' NOT NULL,
	"verification_status" "knowledge_verification_status" DEFAULT 'field_note' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'test_points_equipment_model_id_equipment_models_id_fk') THEN
  ALTER TABLE "test_points" ADD CONSTRAINT "test_points_equipment_model_id_equipment_models_id_fk" FOREIGN KEY ("equipment_model_id") REFERENCES "public"."equipment_models"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "test_points_model_idx" ON "test_points" USING btree ("org_id","equipment_model_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "field_measurements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"session_id" uuid,
	"repair_outcome_id" uuid,
	"equipment_model_id" uuid,
	"test_point_id" uuid,
	"parameter" text NOT NULL,
	"unit" text,
	"expected_min" text,
	"expected_max" text,
	"expected_exact" text,
	"observed_value" text,
	"result" "measurement_result" DEFAULT 'unknown' NOT NULL,
	"test_location" text,
	"instrument_used" text,
	"notes" text,
	"recorded_by" uuid,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'field_measurements_session_id_diagnostic_sessions_id_fk') THEN
  ALTER TABLE "field_measurements" ADD CONSTRAINT "field_measurements_session_id_diagnostic_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."diagnostic_sessions"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "field_measurements_session_idx" ON "field_measurements" USING btree ("session_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "field_measurements_model_idx" ON "field_measurements" USING btree ("equipment_model_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "model_parts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"equipment_model_id" uuid NOT NULL,
	"catalog_item_id" uuid,
	"part_name" text NOT NULL,
	"oem_part_number" text,
	"manufacturer" text,
	"alternative_part_number" text,
	"specifications" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"reliability_notes" text,
	"last_known_price_cents" integer,
	"compatible_model_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confidence_status" "knowledge_confidence" DEFAULT 'unverified' NOT NULL,
	"verification_status" "knowledge_verification_status" DEFAULT 'field_note' NOT NULL,
	"created_by" uuid,
	"verified_by" uuid,
	"verified_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'model_parts_equipment_model_id_equipment_models_id_fk') THEN
  ALTER TABLE "model_parts" ADD CONSTRAINT "model_parts_equipment_model_id_equipment_models_id_fk" FOREIGN KEY ("equipment_model_id") REFERENCES "public"."equipment_models"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "model_parts_model_idx" ON "model_parts" USING btree ("org_id","equipment_model_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "model_parts_oem_idx" ON "model_parts" USING btree ("org_id","oem_part_number");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "part_procurement_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"model_part_id" uuid NOT NULL,
	"supplier_name" text NOT NULL,
	"cost_cents" integer NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"purchased_at" timestamp with time zone DEFAULT now() NOT NULL,
	"job_id" uuid,
	"requested_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'part_procurement_records_model_part_id_model_parts_id_fk') THEN
  ALTER TABLE "part_procurement_records" ADD CONSTRAINT "part_procurement_records_model_part_id_model_parts_id_fk" FOREIGN KEY ("model_part_id") REFERENCES "public"."model_parts"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "part_procurement_part_idx" ON "part_procurement_records" USING btree ("model_part_id","purchased_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "technical_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"title" text NOT NULL,
	"document_type" "technical_document_type" NOT NULL,
	"source_type" "knowledge_source_type" DEFAULT 'internal_research' NOT NULL,
	"equipment_model_id" uuid,
	"known_fault_id" uuid,
	"repair_procedure_id" uuid,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer,
	"version" text,
	"notes" text,
	"uploaded_by" uuid,
	"verification_status" "knowledge_verification_status" DEFAULT 'field_note' NOT NULL,
	"verified_by" uuid,
	"verified_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "technical_documents_model_idx" ON "technical_documents" USING btree ("org_id","equipment_model_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "repair_outcomes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"equipment_id" uuid NOT NULL,
	"equipment_model_id" uuid,
	"diagnostic_session_id" uuid,
	"known_fault_id" uuid,
	"repair_procedure_id" uuid,
	"outcome" "repair_outcome_status" NOT NULL,
	"what_was_done" text,
	"parts_used" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"labor_minutes" integer,
	"technician_id" uuid,
	"machine_status" text,
	"technician_confidence" integer,
	"customer_outcome" text,
	"follow_up_needed" boolean DEFAULT false NOT NULL,
	"is_failed_attempt" boolean DEFAULT false NOT NULL,
	"conclusion" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'repair_outcomes_job_id_jobs_id_fk') THEN
  ALTER TABLE "repair_outcomes" ADD CONSTRAINT "repair_outcomes_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'repair_outcomes_equipment_id_equipment_id_fk') THEN
  ALTER TABLE "repair_outcomes" ADD CONSTRAINT "repair_outcomes_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE restrict ON UPDATE no action;
 END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "repair_outcomes_job_idx" ON "repair_outcomes" USING btree ("job_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "repair_outcomes_equipment_idx" ON "repair_outcomes" USING btree ("equipment_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "repair_outcomes_model_idx" ON "repair_outcomes" USING btree ("org_id","equipment_model_id","outcome");
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'field_measurements_repair_outcome_id_repair_outcomes_id_fk') THEN
  ALTER TABLE "field_measurements" ADD CONSTRAINT "field_measurements_repair_outcome_id_repair_outcomes_id_fk" FOREIGN KEY ("repair_outcome_id") REFERENCES "public"."repair_outcomes"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "knowledge_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"source_job_id" uuid,
	"source_equipment_id" uuid,
	"source_session_id" uuid,
	"source_repair_outcome_id" uuid,
	"equipment_model_id" uuid,
	"proposal_type" "knowledge_proposal_type" NOT NULL,
	"title" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "knowledge_proposal_status" DEFAULT 'field_note' NOT NULL,
	"proposed_by" uuid,
	"reviewed_by" uuid,
	"verified_by" uuid,
	"target_entity_type" text,
	"target_entity_id" uuid,
	"review_notes" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_proposals_status_idx" ON "knowledge_proposals" USING btree ("org_id","status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "knowledge_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"changed_by" uuid,
	"change_reason" text,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_revisions_entity_idx" ON "knowledge_revisions" USING btree ("org_id","entity_type","entity_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "exploded_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"equipment_model_id" uuid NOT NULL,
	"title" text NOT NULL,
	"source_type" "knowledge_source_type" DEFAULT 'internal_research' NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exploded_views_equipment_model_id_equipment_models_id_fk') THEN
  ALTER TABLE "exploded_views" ADD CONSTRAINT "exploded_views_equipment_model_id_equipment_models_id_fk" FOREIGN KEY ("equipment_model_id") REFERENCES "public"."equipment_models"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "exploded_view_components" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"exploded_view_id" uuid NOT NULL,
	"label" text NOT NULL,
	"part_number" text,
	"model_part_id" uuid,
	"position_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exploded_view_components_exploded_view_id_exploded_views_id_fk') THEN
  ALTER TABLE "exploded_view_components" ADD CONSTRAINT "exploded_view_components_exploded_view_id_exploded_views_id_fk" FOREIGN KEY ("exploded_view_id") REFERENCES "public"."exploded_views"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "diagnostic_workflow_extensions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"equipment_model_id" uuid,
	"known_fault_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'diagnostic_workflow_extensions_workflow_id_diagnostic_workflows_id_fk') THEN
  ALTER TABLE "diagnostic_workflow_extensions" ADD CONSTRAINT "diagnostic_workflow_extensions_workflow_id_diagnostic_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."diagnostic_workflows"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "diagnostic_workflow_extensions_workflow_idx" ON "diagnostic_workflow_extensions" USING btree ("workflow_id");
