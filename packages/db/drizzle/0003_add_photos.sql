-- Phase 5a PR 4 — photo uploads table.
-- Stores metadata for job-attached photos; files live on local disk.
CREATE TABLE IF NOT EXISTS "photos" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  "job_id" uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  "object_key" text NOT NULL,
  "content_type" text NOT NULL,
  "file_name" text,
  "file_size" integer,
  "uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX photos_org_job_idx ON photos(org_id, job_id);
