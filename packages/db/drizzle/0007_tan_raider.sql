ALTER TABLE "plugin_events" ADD COLUMN IF NOT EXISTS "next_attempt_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "plugin_events_due_idx" ON "plugin_events" USING btree ("status","next_attempt_at");
