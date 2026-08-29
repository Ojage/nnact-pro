-- Org-level document branding: registration, category, signatory block, terms.
ALTER TABLE "orgs" ADD COLUMN IF NOT EXISTS "registration_number" text;
--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN IF NOT EXISTS "document_category" text;
--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN IF NOT EXISTS "signatory_name" text;
--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN IF NOT EXISTS "signatory_title" text;
--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN IF NOT EXISTS "signature_url" text;
--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN IF NOT EXISTS "stamp_url" text;
--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN IF NOT EXISTS "document_terms" jsonb DEFAULT '[]'::jsonb NOT NULL;
