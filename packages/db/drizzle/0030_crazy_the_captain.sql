DO $$ BEGIN
 CREATE TYPE "public"."estimate_status" AS ENUM('draft', 'sent', 'approved', 'declined', 'expired');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."newsletter_status" AS ENUM('subscribed', 'unsubscribed', 'bounced');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."photo_category" AS ENUM('nameplate', 'before_repair', 'after_repair', 'component', 'board', 'wiring', 'damage', 'measurement', 'part', 'other');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."service_plan_status" AS ENUM('active', 'paused', 'canceled', 'expired');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."service_visit_status" AS ENUM('planned', 'scheduled', 'completed', 'skipped');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."correction_severity" AS ENUM('low', 'medium', 'high', 'safety_critical');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."correction_status" AS ENUM('open', 'triaged', 'in_review', 'fixed', 'rejected');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."diagnostic_mode" AS ENUM('field', 'guided', 'both');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."diagnostic_session_status" AS ENUM('not_started', 'identification_required', 'workflow_ready', 'testing', 'blocked', 'inconclusive', 'diagnosed', 'escalated', 'under_review', 'completed');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."diagnostic_step_type" AS ENUM('check', 'decision', 'reference', 'stop');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."workflow_lifecycle_status" AS ENUM('draft', 'extracted', 'needs_endpoint_review', 'needs_route_review', 'needs_electrical_review', 'needs_field_review', 'pilot', 'validated', 'published', 'suspended', 'retired');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."workflow_support_status" AS ENUM('validated', 'pilot', 'experimental', 'unsupported');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."knowledge_confidence" AS ENUM('unverified', 'field_observation', 'repeated_success', 'technician_verified', 'senior_verified', 'manufacturer_confirmed');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."knowledge_proposal_status" AS ENUM('field_note', 'proposed', 'reviewed', 'verified', 'rejected');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."knowledge_proposal_type" AS ENUM('fault', 'symptom', 'diagnostic_procedure', 'repair_procedure', 'part', 'measurement', 'test_point', 'document');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."knowledge_source_type" AS ENUM('field_job', 'manufacturer', 'supplier', 'internal_research', 'field_observation', 'verified_internal');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."knowledge_verification_status" AS ENUM('field_note', 'proposed', 'reviewed', 'verified', 'rejected', 'archived');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."measurement_result" AS ENUM('pass', 'fail', 'unknown', 'within_range', 'out_of_range');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."repair_outcome_status" AS ENUM('successful', 'partial', 'failed', 'temporary_fix', 'waiting_for_part', 'customer_declined', 'replacement_recommended', 'unrepairable');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."technical_document_type" AS ENUM('service_manual', 'user_manual', 'wiring_diagram', 'schematic', 'datasheet', 'board_image', 'exploded_view', 'internal_report', 'field_note', 'video', 'audio', 'supplier_document');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "device_push_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"provider" text DEFAULT 'fcm' NOT NULL,
	"token" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"document_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"mime" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"data" "bytea" NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "estimate_option_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"option_id" uuid NOT NULL,
	"description" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price" integer DEFAULT 0 NOT NULL,
	"unit_cost" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "estimate_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"estimate_id" uuid NOT NULL,
	"label" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"pricing" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invoice_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"description" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price" integer DEFAULT 0 NOT NULL,
	"unit_cost" integer DEFAULT 0 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "job_voice_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"content_type" text NOT NULL,
	"file_name" text,
	"file_size" integer,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"delivered_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "message_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"document_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"recipient" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"message_id" text,
	"error" text,
	"sent_at" timestamp with time zone,
	"last_attempt_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "newsletter_subscribers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"phone" text,
	"channels" text[] DEFAULT '{"email"}' NOT NULL,
	"source" text DEFAULT 'footer' NOT NULL,
	"status" "newsletter_status" DEFAULT 'subscribed' NOT NULL,
	"verified_at" timestamp with time zone,
	"unsubscribed_at" timestamp with time zone,
	"last_sent_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "portal_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"token_prefix" text NOT NULL,
	"token_cipher" text,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"last_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "customer_service_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"service_plan_id" uuid NOT NULL,
	"status" "service_plan_status" DEFAULT 'active' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"renews_at" timestamp with time zone,
	"renewal_reminder_at" timestamp with time zone,
	"visits_included" integer DEFAULT 2 NOT NULL,
	"visits_completed" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "service_plan_visits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"customer_service_plan_id" uuid NOT NULL,
	"job_id" uuid,
	"title" text NOT NULL,
	"status" "service_visit_status" DEFAULT 'planned' NOT NULL,
	"due_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"notes" text,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "service_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"included_visits_per_term" integer DEFAULT 2 NOT NULL,
	"term_months" integer DEFAULT 12 NOT NULL,
	"price_cents" integer DEFAULT 0 NOT NULL,
	"priority_scheduling" boolean DEFAULT false NOT NULL,
	"benefits" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "diagnostic_correction_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"workflow_version" integer NOT NULL,
	"session_id" uuid,
	"step_id" uuid,
	"reported_by" uuid,
	"category" text NOT NULL,
	"severity" "correction_severity" DEFAULT 'medium' NOT NULL,
	"description" text NOT NULL,
	"status" "correction_status" DEFAULT 'open' NOT NULL,
	"root_cause" text,
	"resolution" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "diagnostic_measurements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"step_id" uuid NOT NULL,
	"entered_by" uuid,
	"value_text" text,
	"unit" text,
	"result" text NOT NULL,
	"note" text,
	"photo_id" uuid,
	"unable_reason" text,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "diagnostic_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"equipment_id" uuid NOT NULL,
	"workflow_id" uuid,
	"workflow_version" integer,
	"known_fault_id" uuid,
	"equipment_model_id" uuid,
	"status" "diagnostic_session_status" DEFAULT 'not_started' NOT NULL,
	"customer_complaint" text,
	"technician_observation" text,
	"error_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"service_tests" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"disposition" text,
	"summary" text,
	"started_by" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "diagnostic_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"step_key" text NOT NULL,
	"public_label" text NOT NULL,
	"sequence" integer DEFAULT 0 NOT NULL,
	"mode" "diagnostic_mode" DEFAULT 'both' NOT NULL,
	"step_type" "diagnostic_step_type" DEFAULT 'check' NOT NULL,
	"purpose" text,
	"safety_state" text,
	"power_state" text,
	"operating_condition" text,
	"meter_mode" text,
	"point_1_label" text,
	"point_1_endpoint" text,
	"point_2_label" text,
	"point_2_endpoint" text,
	"connector" text,
	"pin" text,
	"wire_color" text,
	"expected_text" text,
	"unit" text,
	"pass_interpretation" text,
	"fail_interpretation" text,
	"branch_rules" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"accessibility_note" text,
	"validation_status" text DEFAULT 'unreviewed' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "diagnostic_workflows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"product_type" text NOT NULL,
	"make" text,
	"model_family" text,
	"version_number" integer DEFAULT 1 NOT NULL,
	"support_status" "workflow_support_status" DEFAULT 'experimental' NOT NULL,
	"lifecycle_status" "workflow_lifecycle_status" DEFAULT 'draft' NOT NULL,
	"source_revision" text,
	"applicability" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"limitations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"published_at" timestamp with time zone,
	"retired_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "job_equipment_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"equipment_id" uuid NOT NULL,
	"linked_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trace_routes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"step_id" uuid NOT NULL,
	"label" text NOT NULL,
	"route_kind" text NOT NULL,
	"endpoint_1" text,
	"endpoint_2" text,
	"segment_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"continuity_valid" boolean DEFAULT false NOT NULL,
	"disconnected_islands" integer DEFAULT 0 NOT NULL,
	"unintended_branches" integer DEFAULT 0 NOT NULL,
	"visual_audit_status" text DEFAULT 'pending' NOT NULL,
	"validation_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
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
CREATE TABLE IF NOT EXISTS "fault_symptoms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"fault_id" uuid NOT NULL,
	"symptom_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
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
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"useful_count" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp with time zone,
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
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"useful_count" integer DEFAULT 0 NOT NULL,
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
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"useful_count" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp with time zone,
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
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"uploaded_by" uuid,
	"verification_status" "knowledge_verification_status" DEFAULT 'field_note' NOT NULL,
	"verified_by" uuid,
	"verified_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
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
DROP INDEX IF EXISTS "api_tokens_org_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "appts_window_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "catalog_org_category_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "notif_user_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "notif_unread_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "photos_org_job_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "plugin_events_status_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "plugin_events_due_idx";--> statement-breakpoint
ALTER TABLE "api_tokens" ALTER COLUMN "scopes" SET DATA TYPE jsonb;--> statement-breakpoint
ALTER TABLE "api_tokens" ALTER COLUMN "scopes" SET DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "photos" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "plugin_events" ALTER COLUMN "payload" SET DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "plugins" ALTER COLUMN "events" SET DATA TYPE jsonb;--> statement-breakpoint
ALTER TABLE "plugins" ALTER COLUMN "events" SET DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "plugins" ALTER COLUMN "scopes" SET DATA TYPE jsonb;--> statement-breakpoint
ALTER TABLE "plugins" ALTER COLUMN "scopes" SET DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "plugins" ALTER COLUMN "transform" SET DEFAULT 'identity';--> statement-breakpoint
ALTER TABLE "equipment" ADD COLUMN IF NOT EXISTS "property_id" uuid;--> statement-breakpoint
ALTER TABLE "equipment" ADD COLUMN IF NOT EXISTS "equipment_model_id" uuid;--> statement-breakpoint
ALTER TABLE "equipment" ADD COLUMN IF NOT EXISTS "asset_tag" text;--> statement-breakpoint
ALTER TABLE "equipment" ADD COLUMN IF NOT EXISTS "condition" text;--> statement-breakpoint
ALTER TABLE "equipment" ADD COLUMN IF NOT EXISTS "last_maintenance" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "equipment" ADD COLUMN IF NOT EXISTS "next_maintenance" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "equipment" ADD COLUMN IF NOT EXISTS "nameplate_photo_id" uuid;--> statement-breakpoint
ALTER TABLE "estimates" ADD COLUMN IF NOT EXISTS "number" text DEFAULT 'EST-1000' NOT NULL;--> statement-breakpoint
ALTER TABLE "estimates" ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "estimates" ADD COLUMN IF NOT EXISTS "accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "estimates" ADD COLUMN IF NOT EXISTS "accepted_by_name" text;--> statement-breakpoint
ALTER TABLE "estimates" ADD COLUMN IF NOT EXISTS "status" "estimate_status" DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE "estimates" ADD COLUMN IF NOT EXISTS "pricing" jsonb;--> statement-breakpoint
ALTER TABLE "estimates" ADD COLUMN IF NOT EXISTS "selected_option_id" uuid;--> statement-breakpoint
ALTER TABLE "estimates" ADD COLUMN IF NOT EXISTS "signature_name" text;--> statement-breakpoint
ALTER TABLE "estimates" ADD COLUMN IF NOT EXISTS "sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "estimates" ADD COLUMN IF NOT EXISTS "declined_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "estimates" ADD COLUMN IF NOT EXISTS "copied_to_job_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "estimates" ADD COLUMN IF NOT EXISTS "deposit_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "estimates" ADD COLUMN IF NOT EXISTS "deposit_invoice_id" uuid;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "pricing" jsonb;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "source" text DEFAULT 'staff' NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "service_category" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "service_address" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "preferred_date" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "preferred_time" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "tracking_token_hash" text;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN IF NOT EXISTS "logo_url" text;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN IF NOT EXISTS "brand_color" text DEFAULT '#22C55E' NOT NULL;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN IF NOT EXISTS "document_footer" text;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN IF NOT EXISTS "registration_number" text;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN IF NOT EXISTS "document_category" text;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN IF NOT EXISTS "signatory_name" text;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN IF NOT EXISTS "signatory_title" text;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN IF NOT EXISTS "signature_url" text;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN IF NOT EXISTS "stamp_url" text;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN IF NOT EXISTS "document_terms" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN IF NOT EXISTS "public_email" text;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN IF NOT EXISTS "public_phone" text;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN IF NOT EXISTS "public_address" text;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN IF NOT EXISTS "remove_openfieldpro_attribution" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN IF NOT EXISTS "business_settings" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN IF NOT EXISTS "category" "photo_category" DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN IF NOT EXISTS "equipment_id" uuid;--> statement-breakpoint
ALTER TABLE "plugin_installs" ADD COLUMN IF NOT EXISTS "installed_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "must_change_password" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "walkthrough_progress" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "device_push_tokens" ADD CONSTRAINT "device_push_tokens_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "device_push_tokens" ADD CONSTRAINT "device_push_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documents" ADD CONSTRAINT "documents_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "estimate_option_line_items" ADD CONSTRAINT "estimate_option_line_items_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "estimate_option_line_items" ADD CONSTRAINT "estimate_option_line_items_option_id_estimate_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."estimate_options"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "estimate_options" ADD CONSTRAINT "estimate_options_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "estimate_options" ADD CONSTRAINT "estimate_options_estimate_id_estimates_id_fk" FOREIGN KEY ("estimate_id") REFERENCES "public"."estimates"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_voice_notes" ADD CONSTRAINT "job_voice_notes_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_voice_notes" ADD CONSTRAINT "job_voice_notes_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_voice_notes" ADD CONSTRAINT "job_voice_notes_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "message_logs" ADD CONSTRAINT "message_logs_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "message_logs" ADD CONSTRAINT "message_logs_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "newsletter_subscribers" ADD CONSTRAINT "newsletter_subscribers_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "portal_links" ADD CONSTRAINT "portal_links_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "portal_links" ADD CONSTRAINT "portal_links_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customer_service_plans" ADD CONSTRAINT "customer_service_plans_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customer_service_plans" ADD CONSTRAINT "customer_service_plans_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customer_service_plans" ADD CONSTRAINT "customer_service_plans_service_plan_id_service_plans_id_fk" FOREIGN KEY ("service_plan_id") REFERENCES "public"."service_plans"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "service_plan_visits" ADD CONSTRAINT "service_plan_visits_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "service_plan_visits" ADD CONSTRAINT "service_plan_visits_customer_service_plan_id_customer_service_plans_id_fk" FOREIGN KEY ("customer_service_plan_id") REFERENCES "public"."customer_service_plans"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "service_plan_visits" ADD CONSTRAINT "service_plan_visits_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "service_plans" ADD CONSTRAINT "service_plans_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "diagnostic_correction_reports" ADD CONSTRAINT "diagnostic_correction_reports_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "diagnostic_correction_reports" ADD CONSTRAINT "diagnostic_correction_reports_workflow_id_diagnostic_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."diagnostic_workflows"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "diagnostic_correction_reports" ADD CONSTRAINT "diagnostic_correction_reports_session_id_diagnostic_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."diagnostic_sessions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "diagnostic_correction_reports" ADD CONSTRAINT "diagnostic_correction_reports_step_id_diagnostic_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."diagnostic_steps"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "diagnostic_correction_reports" ADD CONSTRAINT "diagnostic_correction_reports_reported_by_users_id_fk" FOREIGN KEY ("reported_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "diagnostic_measurements" ADD CONSTRAINT "diagnostic_measurements_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "diagnostic_measurements" ADD CONSTRAINT "diagnostic_measurements_session_id_diagnostic_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."diagnostic_sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "diagnostic_measurements" ADD CONSTRAINT "diagnostic_measurements_step_id_diagnostic_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."diagnostic_steps"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "diagnostic_measurements" ADD CONSTRAINT "diagnostic_measurements_entered_by_users_id_fk" FOREIGN KEY ("entered_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "diagnostic_measurements" ADD CONSTRAINT "diagnostic_measurements_photo_id_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."photos"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "diagnostic_sessions" ADD CONSTRAINT "diagnostic_sessions_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "diagnostic_sessions" ADD CONSTRAINT "diagnostic_sessions_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "diagnostic_sessions" ADD CONSTRAINT "diagnostic_sessions_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "diagnostic_sessions" ADD CONSTRAINT "diagnostic_sessions_workflow_id_diagnostic_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."diagnostic_workflows"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "diagnostic_sessions" ADD CONSTRAINT "diagnostic_sessions_started_by_users_id_fk" FOREIGN KEY ("started_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "diagnostic_steps" ADD CONSTRAINT "diagnostic_steps_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "diagnostic_steps" ADD CONSTRAINT "diagnostic_steps_workflow_id_diagnostic_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."diagnostic_workflows"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "diagnostic_workflows" ADD CONSTRAINT "diagnostic_workflows_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_equipment_links" ADD CONSTRAINT "job_equipment_links_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_equipment_links" ADD CONSTRAINT "job_equipment_links_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_equipment_links" ADD CONSTRAINT "job_equipment_links_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_equipment_links" ADD CONSTRAINT "job_equipment_links_linked_by_users_id_fk" FOREIGN KEY ("linked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trace_routes" ADD CONSTRAINT "trace_routes_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trace_routes" ADD CONSTRAINT "trace_routes_step_id_diagnostic_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."diagnostic_steps"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "diagnostic_workflow_extensions" ADD CONSTRAINT "diagnostic_workflow_extensions_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "diagnostic_workflow_extensions" ADD CONSTRAINT "diagnostic_workflow_extensions_workflow_id_diagnostic_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."diagnostic_workflows"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "diagnostic_workflow_extensions" ADD CONSTRAINT "diagnostic_workflow_extensions_equipment_model_id_equipment_models_id_fk" FOREIGN KEY ("equipment_model_id") REFERENCES "public"."equipment_models"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "diagnostic_workflow_extensions" ADD CONSTRAINT "diagnostic_workflow_extensions_known_fault_id_known_faults_id_fk" FOREIGN KEY ("known_fault_id") REFERENCES "public"."known_faults"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "equipment_models" ADD CONSTRAINT "equipment_models_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "equipment_models" ADD CONSTRAINT "equipment_models_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exploded_view_components" ADD CONSTRAINT "exploded_view_components_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exploded_view_components" ADD CONSTRAINT "exploded_view_components_exploded_view_id_exploded_views_id_fk" FOREIGN KEY ("exploded_view_id") REFERENCES "public"."exploded_views"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exploded_view_components" ADD CONSTRAINT "exploded_view_components_model_part_id_model_parts_id_fk" FOREIGN KEY ("model_part_id") REFERENCES "public"."model_parts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exploded_views" ADD CONSTRAINT "exploded_views_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exploded_views" ADD CONSTRAINT "exploded_views_equipment_model_id_equipment_models_id_fk" FOREIGN KEY ("equipment_model_id") REFERENCES "public"."equipment_models"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exploded_views" ADD CONSTRAINT "exploded_views_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fault_symptoms" ADD CONSTRAINT "fault_symptoms_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fault_symptoms" ADD CONSTRAINT "fault_symptoms_fault_id_known_faults_id_fk" FOREIGN KEY ("fault_id") REFERENCES "public"."known_faults"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fault_symptoms" ADD CONSTRAINT "fault_symptoms_symptom_id_symptoms_id_fk" FOREIGN KEY ("symptom_id") REFERENCES "public"."symptoms"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "field_measurements" ADD CONSTRAINT "field_measurements_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "field_measurements" ADD CONSTRAINT "field_measurements_session_id_diagnostic_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."diagnostic_sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "field_measurements" ADD CONSTRAINT "field_measurements_equipment_model_id_equipment_models_id_fk" FOREIGN KEY ("equipment_model_id") REFERENCES "public"."equipment_models"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "field_measurements" ADD CONSTRAINT "field_measurements_test_point_id_test_points_id_fk" FOREIGN KEY ("test_point_id") REFERENCES "public"."test_points"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "field_measurements" ADD CONSTRAINT "field_measurements_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "knowledge_proposals" ADD CONSTRAINT "knowledge_proposals_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "knowledge_proposals" ADD CONSTRAINT "knowledge_proposals_source_job_id_jobs_id_fk" FOREIGN KEY ("source_job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "knowledge_proposals" ADD CONSTRAINT "knowledge_proposals_source_equipment_id_equipment_id_fk" FOREIGN KEY ("source_equipment_id") REFERENCES "public"."equipment"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "knowledge_proposals" ADD CONSTRAINT "knowledge_proposals_source_session_id_diagnostic_sessions_id_fk" FOREIGN KEY ("source_session_id") REFERENCES "public"."diagnostic_sessions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "knowledge_proposals" ADD CONSTRAINT "knowledge_proposals_source_repair_outcome_id_repair_outcomes_id_fk" FOREIGN KEY ("source_repair_outcome_id") REFERENCES "public"."repair_outcomes"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "knowledge_proposals" ADD CONSTRAINT "knowledge_proposals_equipment_model_id_equipment_models_id_fk" FOREIGN KEY ("equipment_model_id") REFERENCES "public"."equipment_models"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "knowledge_proposals" ADD CONSTRAINT "knowledge_proposals_proposed_by_users_id_fk" FOREIGN KEY ("proposed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "knowledge_proposals" ADD CONSTRAINT "knowledge_proposals_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "knowledge_proposals" ADD CONSTRAINT "knowledge_proposals_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "knowledge_revisions" ADD CONSTRAINT "knowledge_revisions_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "knowledge_revisions" ADD CONSTRAINT "knowledge_revisions_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "known_faults" ADD CONSTRAINT "known_faults_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "known_faults" ADD CONSTRAINT "known_faults_equipment_model_id_equipment_models_id_fk" FOREIGN KEY ("equipment_model_id") REFERENCES "public"."equipment_models"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "known_faults" ADD CONSTRAINT "known_faults_source_job_id_jobs_id_fk" FOREIGN KEY ("source_job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "known_faults" ADD CONSTRAINT "known_faults_source_equipment_id_equipment_id_fk" FOREIGN KEY ("source_equipment_id") REFERENCES "public"."equipment"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "known_faults" ADD CONSTRAINT "known_faults_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "known_faults" ADD CONSTRAINT "known_faults_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "model_parts" ADD CONSTRAINT "model_parts_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "model_parts" ADD CONSTRAINT "model_parts_equipment_model_id_equipment_models_id_fk" FOREIGN KEY ("equipment_model_id") REFERENCES "public"."equipment_models"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "model_parts" ADD CONSTRAINT "model_parts_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "model_parts" ADD CONSTRAINT "model_parts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "model_parts" ADD CONSTRAINT "model_parts_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "part_procurement_records" ADD CONSTRAINT "part_procurement_records_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "part_procurement_records" ADD CONSTRAINT "part_procurement_records_model_part_id_model_parts_id_fk" FOREIGN KEY ("model_part_id") REFERENCES "public"."model_parts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "part_procurement_records" ADD CONSTRAINT "part_procurement_records_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "part_procurement_records" ADD CONSTRAINT "part_procurement_records_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "repair_outcomes" ADD CONSTRAINT "repair_outcomes_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "repair_outcomes" ADD CONSTRAINT "repair_outcomes_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "repair_outcomes" ADD CONSTRAINT "repair_outcomes_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "repair_outcomes" ADD CONSTRAINT "repair_outcomes_equipment_model_id_equipment_models_id_fk" FOREIGN KEY ("equipment_model_id") REFERENCES "public"."equipment_models"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "repair_outcomes" ADD CONSTRAINT "repair_outcomes_diagnostic_session_id_diagnostic_sessions_id_fk" FOREIGN KEY ("diagnostic_session_id") REFERENCES "public"."diagnostic_sessions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "repair_outcomes" ADD CONSTRAINT "repair_outcomes_known_fault_id_known_faults_id_fk" FOREIGN KEY ("known_fault_id") REFERENCES "public"."known_faults"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "repair_outcomes" ADD CONSTRAINT "repair_outcomes_repair_procedure_id_repair_procedures_id_fk" FOREIGN KEY ("repair_procedure_id") REFERENCES "public"."repair_procedures"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "repair_outcomes" ADD CONSTRAINT "repair_outcomes_technician_id_users_id_fk" FOREIGN KEY ("technician_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "repair_procedures" ADD CONSTRAINT "repair_procedures_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "repair_procedures" ADD CONSTRAINT "repair_procedures_equipment_model_id_equipment_models_id_fk" FOREIGN KEY ("equipment_model_id") REFERENCES "public"."equipment_models"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "repair_procedures" ADD CONSTRAINT "repair_procedures_known_fault_id_known_faults_id_fk" FOREIGN KEY ("known_fault_id") REFERENCES "public"."known_faults"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "repair_procedures" ADD CONSTRAINT "repair_procedures_source_job_id_jobs_id_fk" FOREIGN KEY ("source_job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "repair_procedures" ADD CONSTRAINT "repair_procedures_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "repair_procedures" ADD CONSTRAINT "repair_procedures_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "symptoms" ADD CONSTRAINT "symptoms_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "symptoms" ADD CONSTRAINT "symptoms_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "technical_documents" ADD CONSTRAINT "technical_documents_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "technical_documents" ADD CONSTRAINT "technical_documents_equipment_model_id_equipment_models_id_fk" FOREIGN KEY ("equipment_model_id") REFERENCES "public"."equipment_models"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "technical_documents" ADD CONSTRAINT "technical_documents_known_fault_id_known_faults_id_fk" FOREIGN KEY ("known_fault_id") REFERENCES "public"."known_faults"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "technical_documents" ADD CONSTRAINT "technical_documents_repair_procedure_id_repair_procedures_id_fk" FOREIGN KEY ("repair_procedure_id") REFERENCES "public"."repair_procedures"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "technical_documents" ADD CONSTRAINT "technical_documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "technical_documents" ADD CONSTRAINT "technical_documents_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "test_points" ADD CONSTRAINT "test_points_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "test_points" ADD CONSTRAINT "test_points_equipment_model_id_equipment_models_id_fk" FOREIGN KEY ("equipment_model_id") REFERENCES "public"."equipment_models"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "test_points" ADD CONSTRAINT "test_points_photo_id_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."photos"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "test_points" ADD CONSTRAINT "test_points_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "device_push_tokens_token_idx" ON "device_push_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "device_push_tokens_user_idx" ON "device_push_tokens" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "documents_org_kind_document_idx" ON "documents" USING btree ("org_id","kind","document_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "estimate_option_lines_org_option_idx" ON "estimate_option_line_items" USING btree ("org_id","option_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "estimate_options_position_idx" ON "estimate_options" USING btree ("estimate_id","position");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "estimate_options_org_estimate_idx" ON "estimate_options" USING btree ("org_id","estimate_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoice_line_items_org_invoice_idx" ON "invoice_line_items" USING btree ("org_id","invoice_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_voice_notes_job_idx" ON "job_voice_notes" USING btree ("org_id","job_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_voice_notes_author_idx" ON "job_voice_notes" USING btree ("org_id","author_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_logs_org_document_idx" ON "message_logs" USING btree ("org_id","kind","document_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "newsletter_subscribers_org_email_idx" ON "newsletter_subscribers" USING btree ("org_id","email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "newsletter_subscribers_org_status_idx" ON "newsletter_subscribers" USING btree ("org_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "portal_links_hash_idx" ON "portal_links" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portal_links_org_customer_idx" ON "portal_links" USING btree ("org_id","customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_service_plans_customer_idx" ON "customer_service_plans" USING btree ("org_id","customer_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_service_plans_plan_idx" ON "customer_service_plans" USING btree ("org_id","service_plan_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "service_plan_visits_plan_idx" ON "service_plan_visits" USING btree ("org_id","customer_service_plan_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "service_plan_visits_due_idx" ON "service_plan_visits" USING btree ("org_id","due_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "service_plans_org_idx" ON "service_plans" USING btree ("org_id","active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "diagnostic_corrections_workflow_idx" ON "diagnostic_correction_reports" USING btree ("workflow_id","status","severity");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "diagnostic_measurements_session_idx" ON "diagnostic_measurements" USING btree ("session_id","recorded_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "diagnostic_measurements_step_idx" ON "diagnostic_measurements" USING btree ("step_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "diagnostic_sessions_org_status_idx" ON "diagnostic_sessions" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "diagnostic_sessions_job_idx" ON "diagnostic_sessions" USING btree ("job_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "diagnostic_sessions_equipment_idx" ON "diagnostic_sessions" USING btree ("equipment_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "diagnostic_steps_workflow_key_idx" ON "diagnostic_steps" USING btree ("workflow_id","step_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "diagnostic_steps_sequence_idx" ON "diagnostic_steps" USING btree ("workflow_id","sequence");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "diagnostic_workflows_org_status_idx" ON "diagnostic_workflows" USING btree ("org_id","lifecycle_status","support_status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "diagnostic_workflows_model_idx" ON "diagnostic_workflows" USING btree ("org_id","make","model_family");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "job_equipment_links_job_idx" ON "job_equipment_links" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_equipment_links_equipment_idx" ON "job_equipment_links" USING btree ("org_id","equipment_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trace_routes_step_idx" ON "trace_routes" USING btree ("step_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "diagnostic_workflow_extensions_workflow_idx" ON "diagnostic_workflow_extensions" USING btree ("workflow_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "equipment_models_org_normalized_idx" ON "equipment_models" USING btree ("org_id","normalized_identifier");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "equipment_models_org_category_idx" ON "equipment_models" USING btree ("org_id","category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "equipment_models_search_idx" ON "equipment_models" USING btree ("org_id","manufacturer","model_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exploded_view_components_view_idx" ON "exploded_view_components" USING btree ("exploded_view_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exploded_views_model_idx" ON "exploded_views" USING btree ("org_id","equipment_model_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fault_symptoms_pair_idx" ON "fault_symptoms" USING btree ("fault_id","symptom_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "field_measurements_session_idx" ON "field_measurements" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "field_measurements_model_idx" ON "field_measurements" USING btree ("equipment_model_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_proposals_status_idx" ON "knowledge_proposals" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_proposals_model_idx" ON "knowledge_proposals" USING btree ("equipment_model_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_revisions_entity_idx" ON "knowledge_revisions" USING btree ("org_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "known_faults_model_idx" ON "known_faults" USING btree ("org_id","equipment_model_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "known_faults_code_idx" ON "known_faults" USING btree ("org_id","normalized_fault_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "model_parts_model_idx" ON "model_parts" USING btree ("org_id","equipment_model_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "model_parts_oem_idx" ON "model_parts" USING btree ("org_id","oem_part_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "part_procurement_part_idx" ON "part_procurement_records" USING btree ("model_part_id","purchased_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "repair_outcomes_job_idx" ON "repair_outcomes" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "repair_outcomes_equipment_idx" ON "repair_outcomes" USING btree ("equipment_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "repair_outcomes_model_idx" ON "repair_outcomes" USING btree ("org_id","equipment_model_id","outcome");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "repair_procedures_model_idx" ON "repair_procedures" USING btree ("org_id","equipment_model_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "repair_procedures_fault_idx" ON "repair_procedures" USING btree ("known_fault_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "symptoms_org_normalized_idx" ON "symptoms" USING btree ("org_id","normalized_label");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "technical_documents_model_idx" ON "technical_documents" USING btree ("org_id","equipment_model_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "technical_documents_type_idx" ON "technical_documents" USING btree ("org_id","document_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "test_points_model_idx" ON "test_points" USING btree ("org_id","equipment_model_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "equipment" ADD CONSTRAINT "equipment_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "estimates" ADD CONSTRAINT "estimates_deposit_invoice_id_invoices_id_fk" FOREIGN KEY ("deposit_invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "appointments_org_starts_idx" ON "appointments" USING btree ("org_id","starts_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "appointments_job_idx" ON "appointments" USING btree ("job_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "catalog_categories_org_name_idx" ON "catalog_categories" USING btree ("org_id","name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "catalog_items_org_active_idx" ON "catalog_items" USING btree ("org_id","active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "catalog_items_category_idx" ON "catalog_items" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "equipment_model_idx" ON "equipment" USING btree ("org_id","equipment_model_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "equipment_serial_idx" ON "equipment" USING btree ("org_id","serial_number");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "jobs_tracking_hash_idx" ON "jobs" USING btree ("tracking_token_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_user_unread_idx" ON "notifications" USING btree ("user_id","read","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "photos_job_idx" ON "photos" USING btree ("org_id","job_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "plugin_events_retry_idx" ON "plugin_events" USING btree ("status","next_attempt_at");--> statement-breakpoint
ALTER TABLE "catalog_items" DROP COLUMN IF EXISTS "version";--> statement-breakpoint
ALTER TABLE "catalog_items" DROP COLUMN IF EXISTS "updated_at";--> statement-breakpoint
ALTER TABLE "plugin_installs" DROP COLUMN IF EXISTS "created_at";