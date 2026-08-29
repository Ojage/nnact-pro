-- WhatsApp-style delivery/read status on field voice notes.
ALTER TABLE "job_voice_notes"
  ADD COLUMN IF NOT EXISTS "delivered_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "read_at" timestamp with time zone;

CREATE INDEX IF NOT EXISTS job_voice_notes_delivery_idx
  ON job_voice_notes(org_id, job_id, delivered_at);