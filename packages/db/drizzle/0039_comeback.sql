CREATE TYPE "public"."comeback_status" AS ENUM('REPORTED', 'TRIAGED', 'SCHEDULED', 'UNDER_INVESTIGATION', 'WAITING_FOR_PART', 'AWAITING_VERIFICATION', 'RESOLVED', 'MONITORING', 'CLOSED', 'DISPUTED', 'NOT_A_COMEBACK');--> statement-breakpoint
CREATE TYPE "public"."comeback_severity" AS ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');--> statement-breakpoint
CREATE TYPE "public"."comeback_fault_relationship" AS ENUM('SAME_FAULT', 'RELATED_FAULT', 'NEW_UNRELATED_FAULT', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."comeback_intake_reason" AS ENUM('CUSTOMER_CALLED', 'CUSTOMER_VISIT', 'STAFF_NOTICED', 'MAINTENANCE_REPORT', 'ONLINE_REVIEW', 'FOLLOW_UP_CALL', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."comeback_root_cause" AS ENUM('INCOMPLETE_DIAGNOSIS', 'MISDIAGNOSIS', 'WORKMANSHIP', 'REASSEMBLY_ERROR', 'PART_FAILED_EARLY', 'WRONG_PART_FITTED', 'SECONDARY_FAULT_MISSED', 'INSTALLATION_ERROR', 'POWER_OR_INSTALLATION_ISSUE', 'ENVIRONMENTAL_CONDITION', 'CUSTOMER_MISUSE', 'CUSTOMER_EXPECTATION', 'MANUFACTURER_DEFECT', 'NORMAL_WEAR', 'NO_FAULT_FOUND', 'OTHER', 'NOT_DETERMINED_YET');--> statement-breakpoint
CREATE TYPE "public"."comeback_responsibility" AS ENUM('NNACT_RESPONSIBLE', 'PARTIAL_NNACT_RESPONSIBLE', 'PART_OR_SUPPLIER_FAILURE', 'MANUFACTURER_ISSUE', 'CUSTOMER_CAUSED', 'EXTERNAL_CONDITION', 'NEW_UNRELATED_FAULT', 'UNDETERMINED');--> statement-breakpoint
CREATE TYPE "public"."comeback_preventability" AS ENUM('PREVENTABLE', 'POSSIBLY_PREVENTABLE', 'NOT_PREVENTABLE', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."comeback_billing_decision" AS ENUM('NO_CHARGE', 'PARTIAL_CHARGE', 'FULL_CHARGE', 'PENDING_REVIEW');--> statement-breakpoint
CREATE TYPE "public"."comeback_warranty_status" AS ENUM('FULL', 'WORKMANSHIP', 'PARTS', 'OUT_OF_WARRANTY', 'UNCLEAR');--> statement-breakpoint
CREATE TYPE "public"."comeback_action_status" AS ENUM('OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."comeback_corrective_action_kind" AS ENUM('UPDATE_DIAGNOSTIC_PROCEDURE', 'UPDATE_REPAIR_PROCEDURE', 'TECHNICIAN_TRAINING', 'SUPPLIER_CHANGE', 'ADD_FINAL_CHECK', 'CUSTOMER_GUIDANCE', 'KNOWLEDGE_ARTICLE', 'PROCESS_CHANGE', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."comeback_cost_kind" AS ENUM('PARTS', 'LABOUR', 'TRANSPORT', 'FUEL', 'MISCELLANEOUS');--> statement-breakpoint
CREATE TYPE "public"."comeback_cost_class" AS ENUM('WARRANTY_COST', 'QUALITY_COST', 'BILLABLE_COMEBACK', 'SUPPLIER_RECOVERABLE');--> statement-breakpoint
CREATE TYPE "public"."comeback_evidence_kind" AS ENUM('COMPLAINT', 'ORIGINAL_REPAIR', 'COMEBACK_INSPECTION', 'FAILED_PART', 'CORRECTIVE_ACTION', 'FINAL_TEST', 'AFTER_REPAIR', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."comeback_communication_kind" AS ENUM('COMPLAINT_RECEIVED', 'VISIT_SCHEDULED', 'TECH_DISPATCHED', 'PART_AWAITED', 'RESOLVED_ANNOUNCED', 'CUSTOMER_FOLLOW_UP', 'RECOVERY_OFFER', 'SERVICE_CREDIT', 'INVOICE_ISSUED', 'CUSTOMER_CONFIRMATION', 'ESCALATION_NOTICE', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."comeback_monitoring_outcome" AS ENUM('PENDING', 'NO_RELAPSE', 'RELAPSE', 'ESCALATED');--> statement-breakpoint
CREATE TYPE "public"."comeback_customer_confirmation" AS ENUM('NOT_CONTACTED', 'CONTACTED_PENDING', 'CONFIRMED_RESOLVED', 'DISPUTED_RESOLUTION');--> statement-breakpoint
CREATE TABLE "comeback_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"case_number" text NOT NULL,
	"original_job_id" uuid,
	"customer_id" uuid,
	"property_id" uuid,
	"equipment_id" uuid,
	"reported_by" uuid,
	"reported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"intake_reason" "comeback_intake_reason" DEFAULT 'CUSTOMER_CALLED' NOT NULL,
	"complaint_summary" text NOT NULL,
	"complaint_details" text,
	"original_complaint" text,
	"original_diagnosis" text,
	"original_repair_summary" text,
	"original_job_completed_at" timestamp with time zone,
	"severity" "comeback_severity" DEFAULT 'MEDIUM' NOT NULL,
	"status" "comeback_status" DEFAULT 'REPORTED' NOT NULL,
	"fault_relationship" "comeback_fault_relationship" DEFAULT 'UNKNOWN' NOT NULL,
	"root_cause" "comeback_root_cause",
	"root_cause_notes" text,
	"responsibility" "comeback_responsibility",
	"preventability" "comeback_preventability",
	"preventability_note" text,
	"warranty_status" "comeback_warranty_status" DEFAULT 'UNCLEAR' NOT NULL,
	"workmanship_warranty_ends_at" timestamp with time zone,
	"parts_warranty_ends_at" timestamp with time zone,
	"billing_decision" "comeback_billing_decision" DEFAULT 'PENDING_REVIEW' NOT NULL,
	"charge_amount_cents" integer DEFAULT 0 NOT NULL,
	"customer_confirmation" "comeback_customer_confirmation" DEFAULT 'NOT_CONTACTED' NOT NULL,
	"monitoring_outcome" "comeback_monitoring_outcome" DEFAULT 'PENDING' NOT NULL,
	"assigned_reviewer_id" uuid,
	"assigned_technician_id" uuid,
	"repeat_number" integer DEFAULT 1 NOT NULL,
	"escalation_level" integer DEFAULT 0 NOT NULL,
	"escalated" boolean DEFAULT false NOT NULL,
	"resolution_summary" text,
	"consideration_notes" text,
	"deny_reason" text,
	"knowledge_proposal_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "comeback_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"from_status" "comeback_status",
	"to_status" "comeback_status" NOT NULL,
	"changed_by" uuid,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "comeback_corrective_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"kind" "comeback_corrective_action_kind" NOT NULL,
	"description" text NOT NULL,
	"owner_id" uuid,
	"status" "comeback_action_status" DEFAULT 'OPEN' NOT NULL,
	"due_at" timestamp with time zone,
	"affects_procedure" boolean DEFAULT true NOT NULL,
	"completed_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "comeback_costs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"job_id" uuid,
	"kind" "comeback_cost_kind" NOT NULL,
	"cost_class" "comeback_cost_class" NOT NULL,
	"description" text NOT NULL,
	"amount_cents" integer DEFAULT 0 NOT NULL,
	"supplier_name" text,
	"model_part_id" uuid,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "comeback_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"job_id" uuid,
	"kind" "comeback_evidence_kind" NOT NULL,
	"photo_id" uuid,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "comeback_communications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"kind" "comeback_communication_kind" NOT NULL,
	"summary" text NOT NULL,
	"happened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "comeback_follow_ups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"outcome" "comeback_monitoring_outcome" DEFAULT 'PENDING' NOT NULL,
	"note" text,
	"checked_by" uuid,
	"checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "job_type" text DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "comeback_case_id" uuid;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "original_job_id" uuid;--> statement-breakpoint
ALTER TABLE "comeback_cases" ADD CONSTRAINT "comeback_cases_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comeback_cases" ADD CONSTRAINT "comeback_cases_original_job_id_jobs_id_fk" FOREIGN KEY ("original_job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comeback_cases" ADD CONSTRAINT "comeback_cases_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comeback_cases" ADD CONSTRAINT "comeback_cases_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comeback_cases" ADD CONSTRAINT "comeback_cases_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comeback_cases" ADD CONSTRAINT "comeback_cases_reported_by_users_id_fk" FOREIGN KEY ("reported_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comeback_cases" ADD CONSTRAINT "comeback_cases_assigned_reviewer_id_users_id_fk" FOREIGN KEY ("assigned_reviewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comeback_cases" ADD CONSTRAINT "comeback_cases_assigned_technician_id_users_id_fk" FOREIGN KEY ("assigned_technician_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comeback_cases" ADD CONSTRAINT "comeback_cases_knowledge_proposal_id_knowledge_proposals_id_fk" FOREIGN KEY ("knowledge_proposal_id") REFERENCES "public"."knowledge_proposals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comeback_status_history" ADD CONSTRAINT "comeback_status_history_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comeback_status_history" ADD CONSTRAINT "comeback_status_history_case_id_comeback_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."comeback_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comeback_status_history" ADD CONSTRAINT "comeback_status_history_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comeback_corrective_actions" ADD CONSTRAINT "comeback_corrective_actions_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comeback_corrective_actions" ADD CONSTRAINT "comeback_corrective_actions_case_id_comeback_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."comeback_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comeback_corrective_actions" ADD CONSTRAINT "comeback_corrective_actions_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comeback_corrective_actions" ADD CONSTRAINT "comeback_corrective_actions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comeback_costs" ADD CONSTRAINT "comeback_costs_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comeback_costs" ADD CONSTRAINT "comeback_costs_case_id_comeback_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."comeback_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comeback_costs" ADD CONSTRAINT "comeback_costs_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comeback_costs" ADD CONSTRAINT "comeback_costs_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comeback_evidence" ADD CONSTRAINT "comeback_evidence_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comeback_evidence" ADD CONSTRAINT "comeback_evidence_case_id_comeback_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."comeback_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comeback_evidence" ADD CONSTRAINT "comeback_evidence_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comeback_evidence" ADD CONSTRAINT "comeback_evidence_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comeback_communications" ADD CONSTRAINT "comeback_communications_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comeback_communications" ADD CONSTRAINT "comeback_communications_case_id_comeback_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."comeback_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comeback_communications" ADD CONSTRAINT "comeback_communications_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comeback_follow_ups" ADD CONSTRAINT "comeback_follow_ups_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comeback_follow_ups" ADD CONSTRAINT "comeback_follow_ups_case_id_comeback_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."comeback_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comeback_follow_ups" ADD CONSTRAINT "comeback_follow_ups_checked_by_users_id_fk" FOREIGN KEY ("checked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_original_job_id_jobs_id_fk" FOREIGN KEY ("original_job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_comeback_case_id_comeback_cases_id_fk" FOREIGN KEY ("comeback_case_id") REFERENCES "public"."comeback_cases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "comeback_cases_org_number_idx" ON "comeback_cases" ("org_id", "case_number");--> statement-breakpoint
CREATE INDEX "comeback_cases_org_status_idx" ON "comeback_cases" ("org_id", "status");--> statement-breakpoint
CREATE INDEX "comeback_cases_org_original_job_idx" ON "comeback_cases" ("org_id", "original_job_id");--> statement-breakpoint
CREATE INDEX "comeback_cases_org_customer_idx" ON "comeback_cases" ("org_id", "customer_id");--> statement-breakpoint
CREATE INDEX "comeback_cases_org_severity_idx" ON "comeback_cases" ("org_id", "severity");--> statement-breakpoint
CREATE INDEX "comeback_status_history_case_idx" ON "comeback_status_history" ("org_id", "case_id", "created_at");--> statement-breakpoint
CREATE INDEX "comeback_corrective_actions_case_idx" ON "comeback_corrective_actions" ("org_id", "case_id");--> statement-breakpoint
CREATE INDEX "comeback_costs_case_idx" ON "comeback_costs" ("org_id", "case_id");--> statement-breakpoint
CREATE INDEX "comeback_evidence_case_idx" ON "comeback_evidence" ("org_id", "case_id");--> statement-breakpoint
CREATE INDEX "comeback_communications_case_idx" ON "comeback_communications" ("org_id", "case_id");--> statement-breakpoint
CREATE INDEX "comeback_follow_ups_case_idx" ON "comeback_follow_ups" ("org_id", "case_id");--> statement-breakpoint
CREATE INDEX "jobs_comeback_case_idx" ON "jobs" ("org_id", "comeback_case_id");--> statement-breakpoint
CREATE INDEX "jobs_original_job_idx" ON "jobs" ("org_id", "original_job_id");--> statement-breakpoint
