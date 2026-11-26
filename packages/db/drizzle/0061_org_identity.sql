-- Organization identity for display: a short name (for example "NHARM") and
-- a Google-style numeric public id shown in place of the internal uuid.
CREATE SEQUENCE IF NOT EXISTS "orgs_public_number_seq" AS bigint START WITH 302918475601;--> statement-breakpoint
CREATE OR REPLACE FUNCTION "nnact_new_org_public_id"() RETURNS text LANGUAGE sql VOLATILE AS $$
	SELECT nextval('orgs_public_number_seq')::text
$$;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN IF NOT EXISTS "short_name" text;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN IF NOT EXISTS "public_id" text;--> statement-breakpoint
UPDATE "orgs" SET "public_id" = "nnact_new_org_public_id"() WHERE "public_id" IS NULL OR "public_id" !~ '^[0-9]{12}$';--> statement-breakpoint
ALTER TABLE "orgs" ALTER COLUMN "public_id" SET DEFAULT "nnact_new_org_public_id"();--> statement-breakpoint
ALTER TABLE "orgs" ALTER COLUMN "public_id" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "orgs_public_id_idx" ON "orgs" ("public_id");
