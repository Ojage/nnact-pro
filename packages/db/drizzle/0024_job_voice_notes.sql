-- Field voice notes attached to jobs (technician → office).
CREATE TABLE IF NOT EXISTS "job_voice_notes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  "job_id" uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  "author_user_id" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "object_key" text NOT NULL,
  "content_type" text NOT NULL,
  "file_name" text,
  "file_size" integer,
  "duration_ms" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS job_voice_notes_job_idx ON job_voice_notes(org_id, job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS job_voice_notes_author_idx ON job_voice_notes(org_id, author_user_id);
