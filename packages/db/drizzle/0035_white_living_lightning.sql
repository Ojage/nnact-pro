CREATE TABLE "job_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"from_status" "job_status",
	"to_status" "job_status" NOT NULL,
	"changed_by" uuid,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "number" text;--> statement-breakpoint
ALTER TABLE "job_status_history" ADD CONSTRAINT "job_status_history_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_status_history" ADD CONSTRAINT "job_status_history_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_status_history" ADD CONSTRAINT "job_status_history_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_status_history_job_idx" ON "job_status_history" USING btree ("org_id","job_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_org_number_idx" ON "jobs" USING btree ("org_id","number");--> statement-breakpoint
-- Backfill human-readable work-order numbers for pre-existing jobs (per org,
-- ordered by creation). Matches the DEFAULT business-settings numbering.
WITH numbered AS (
	SELECT
		id,
		row_number() OVER (PARTITION BY org_id ORDER BY created_at, id)::int + 999 AS seq
	FROM jobs
	WHERE number IS NULL
)
UPDATE jobs j
SET number = 'JOB-' || lpad(numbered.seq::text, 4, '0')
FROM numbered
WHERE j.id = numbered.id;--> statement-breakpoint
-- Seed the status timeline for pre-existing jobs (fromStatus NULL = creation).
INSERT INTO job_status_history (org_id, job_id, from_status, to_status, changed_by, reason)
SELECT org_id, id, NULL, status, NULL, 'backfill: pre-migration status'
FROM jobs;