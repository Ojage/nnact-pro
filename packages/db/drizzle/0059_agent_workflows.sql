CREATE TABLE IF NOT EXISTS "triage_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"job_id" uuid NOT NULL REFERENCES "jobs"("id") ON DELETE cascade,
	"run_id" uuid REFERENCES "agent_runs"("id") ON DELETE set null,
	"state" text DEFAULT 'shadow' NOT NULL,
	"current" integer DEFAULT 1 NOT NULL,
	"shadow" integer DEFAULT 1 NOT NULL,
	"fingerprint" text NOT NULL,
	"symptoms" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"likely_faults" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"rationale" text NOT NULL,
	"missing_information" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confidence" double precision DEFAULT 0 NOT NULL,
	"outcome_reason" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "triage_suggestions_current_job_idx" ON "triage_suggestions" ("org_id","job_id") WHERE "current" = 1;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "triage_suggestions_job_created_idx" ON "triage_suggestions" ("job_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "triage_suggestions_org_state_idx" ON "triage_suggestions" ("org_id","state");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "triage_suggestions_run_idx" ON "triage_suggestions" ("run_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "supplier_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"phone_e164" text,
	"email" text,
	"area" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "supplier_contacts_org_name_idx" ON "supplier_contacts" ("org_id","name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "supplier_contacts_org_area_idx" ON "supplier_contacts" ("org_id","area");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sourcing_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"job_id" uuid NOT NULL REFERENCES "jobs"("id") ON DELETE cascade,
	"run_id" uuid REFERENCES "agent_runs"("id") ON DELETE set null,
	"state" text DEFAULT 'shadow' NOT NULL,
	"current" integer DEFAULT 1 NOT NULL,
	"shadow" integer DEFAULT 1 NOT NULL,
	"fingerprint" text NOT NULL,
	"low_cents" integer,
	"high_cents" integer,
	"lines" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confidence" double precision DEFAULT 0 NOT NULL,
	"rationale" text NOT NULL,
	"assumptions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"missing_information" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"outcome_reason" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sourcing_suggestions_current_job_idx" ON "sourcing_suggestions" ("org_id","job_id") WHERE "current" = 1;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sourcing_suggestions_job_created_idx" ON "sourcing_suggestions" ("job_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sourcing_suggestions_org_state_idx" ON "sourcing_suggestions" ("org_id","state");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sourcing_suggestions_run_idx" ON "sourcing_suggestions" ("run_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "supplier_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"suggestion_id" uuid NOT NULL REFERENCES "sourcing_suggestions"("id") ON DELETE cascade,
	"supplier_contact_id" uuid NOT NULL REFERENCES "supplier_contacts"("id") ON DELETE cascade,
	"run_id" uuid REFERENCES "agent_runs"("id") ON DELETE set null,
	"line_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"template_slug" text NOT NULL,
	"to_phone" text NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"provider_message_id" text,
	"error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "supplier_messages_idempotent_idx" ON "supplier_messages" ("org_id","suggestion_id","supplier_contact_id","template_slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "supplier_messages_suggestion_idx" ON "supplier_messages" ("suggestion_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payment_reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL REFERENCES "invoices"("id") ON DELETE cascade,
	"customer_id" uuid REFERENCES "customers"("id") ON DELETE set null,
	"run_id" uuid REFERENCES "agent_runs"("id") ON DELETE set null,
	"to_phone" text,
	"template_slug" text NOT NULL,
	"balance_cents" integer NOT NULL,
	"days_overdue" integer NOT NULL,
	"portal_link" text,
	"body" text,
	"status" text DEFAULT 'suggested' NOT NULL,
	"message_log_id" uuid REFERENCES "message_logs"("id") ON DELETE set null,
	"provider_message_id" text,
	"error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payment_reminders_invoice_day_idx" ON "payment_reminders" ("org_id","invoice_id",(date_trunc('day', "created_at" at time zone 'UTC')));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_reminders_invoice_idx" ON "payment_reminders" ("invoice_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_reminders_org_status_idx" ON "payment_reminders" ("org_id","status");
