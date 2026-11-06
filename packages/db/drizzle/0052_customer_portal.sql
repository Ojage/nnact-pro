CREATE TABLE IF NOT EXISTS "customer_portal_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"email_updates" boolean DEFAULT true NOT NULL,
	"sms_updates" boolean DEFAULT true NOT NULL,
	"marketing_opt_in" boolean DEFAULT false NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "customer_appointment_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"appointment_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_starts_at" timestamp with time zone,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "customer_support_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"job_id" uuid,
	"kind" text DEFAULT 'general' NOT NULL,
	"subject" text NOT NULL,
	"message" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"response" text,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "customer_notification_reads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"notification_key" text NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customer_portal_preferences_org_id_orgs_id_fk') THEN
  ALTER TABLE "customer_portal_preferences" ADD CONSTRAINT "customer_portal_preferences_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customer_portal_preferences_account_id_customer_accounts_id_fk') THEN
  ALTER TABLE "customer_portal_preferences" ADD CONSTRAINT "customer_portal_preferences_account_id_customer_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."customer_accounts"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customer_portal_preferences_customer_id_customers_id_fk') THEN
  ALTER TABLE "customer_portal_preferences" ADD CONSTRAINT "customer_portal_preferences_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customer_appointment_requests_org_id_orgs_id_fk') THEN
  ALTER TABLE "customer_appointment_requests" ADD CONSTRAINT "customer_appointment_requests_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customer_appointment_requests_account_id_customer_accounts_id_fk') THEN
  ALTER TABLE "customer_appointment_requests" ADD CONSTRAINT "customer_appointment_requests_account_id_customer_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."customer_accounts"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customer_appointment_requests_customer_id_customers_id_fk') THEN
  ALTER TABLE "customer_appointment_requests" ADD CONSTRAINT "customer_appointment_requests_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customer_appointment_requests_appointment_id_appointments_id_fk') THEN
  ALTER TABLE "customer_appointment_requests" ADD CONSTRAINT "customer_appointment_requests_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customer_appointment_requests_job_id_jobs_id_fk') THEN
  ALTER TABLE "customer_appointment_requests" ADD CONSTRAINT "customer_appointment_requests_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customer_support_requests_org_id_orgs_id_fk') THEN
  ALTER TABLE "customer_support_requests" ADD CONSTRAINT "customer_support_requests_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customer_support_requests_account_id_customer_accounts_id_fk') THEN
  ALTER TABLE "customer_support_requests" ADD CONSTRAINT "customer_support_requests_account_id_customer_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."customer_accounts"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customer_support_requests_customer_id_customers_id_fk') THEN
  ALTER TABLE "customer_support_requests" ADD CONSTRAINT "customer_support_requests_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customer_support_requests_job_id_jobs_id_fk') THEN
  ALTER TABLE "customer_support_requests" ADD CONSTRAINT "customer_support_requests_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;
 END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customer_notification_reads_org_id_orgs_id_fk') THEN
  ALTER TABLE "customer_notification_reads" ADD CONSTRAINT "customer_notification_reads_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customer_notification_reads_account_id_customer_accounts_id_fk') THEN
  ALTER TABLE "customer_notification_reads" ADD CONSTRAINT "customer_notification_reads_account_id_customer_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."customer_accounts"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customer_notification_reads_customer_id_customers_id_fk') THEN
  ALTER TABLE "customer_notification_reads" ADD CONSTRAINT "customer_notification_reads_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "customer_portal_preferences_org_account_idx" ON "customer_portal_preferences" USING btree ("org_id","account_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_portal_preferences_customer_idx" ON "customer_portal_preferences" USING btree ("org_id","customer_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_appointment_requests_appointment_idx" ON "customer_appointment_requests" USING btree ("org_id","appointment_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_appointment_requests_customer_idx" ON "customer_appointment_requests" USING btree ("org_id","customer_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_support_requests_customer_idx" ON "customer_support_requests" USING btree ("org_id","customer_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_support_requests_status_idx" ON "customer_support_requests" USING btree ("org_id","status","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "customer_notification_reads_account_key_idx" ON "customer_notification_reads" USING btree ("account_id","notification_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_notification_reads_customer_idx" ON "customer_notification_reads" USING btree ("org_id","customer_id");
