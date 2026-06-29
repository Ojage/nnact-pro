ALTER TABLE "plugins" ADD COLUMN IF NOT EXISTS "transform" text DEFAULT 'generic' NOT NULL;
