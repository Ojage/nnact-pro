-- Branches: organization > branch, like organization > project.
-- Foundation only: no business table carries a branch yet, and no query is
-- scoped by branch. Every organization gets one default "Main Branch".
CREATE TABLE IF NOT EXISTS "branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL REFERENCES "orgs"("id") ON DELETE cascade,
	"public_id" text NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "branches_public_id_idx" ON "branches" ("public_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "branches_org_name_idx" ON "branches" ("org_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "branches_org_default_idx" ON "branches" ("org_id") WHERE "is_default";--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "branch_memberships" (
	"user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
	"branch_id" uuid NOT NULL REFERENCES "branches"("id") ON DELETE cascade,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "branch_memberships_user_id_branch_id_pk" PRIMARY KEY("user_id","branch_id")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "branch_memberships_branch_idx" ON "branch_memberships" ("branch_id");--> statement-breakpoint
-- 'all': every branch of the user's organization (owners always). 'specific': only branch_memberships rows.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "branch_access" text DEFAULT 'all' NOT NULL;--> statement-breakpoint
-- Google-style project ids: readable slugs derived from the branch name.
CREATE OR REPLACE FUNCTION "nnact_branch_slug"(raw text) RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
	base text;
BEGIN
	base := regexp_replace(lower(coalesce(raw, '')), '[^a-z0-9]+', '-', 'g');
	base := btrim(base, '-');
	base := substring(base from 1 for 24);
	base := rtrim(base, '-');
	IF base = '' THEN
		base := 'branch';
	ELSIF base !~ '^[a-z]' THEN
		base := 'branch-' || base;
		base := substring(base from 1 for 24);
		base := rtrim(base, '-');
	END IF;
	RETURN base;
END
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION "nnact_new_branch_public_id"(branch_name text DEFAULT 'Main Branch') RETURNS text LANGUAGE plpgsql VOLATILE AS $$
DECLARE
	base text := "nnact_branch_slug"(branch_name);
	candidate text;
	suffix integer := 0;
BEGIN
	LOOP
		candidate := CASE
			WHEN suffix = 0 THEN base
			ELSE rtrim(left(base, 30 - length(suffix::text) - 1), '-') || '-' || suffix::text
		END;
		EXIT WHEN NOT EXISTS (SELECT 1 FROM "branches" WHERE "public_id" = candidate);
		suffix := suffix + 1;
	END LOOP;
	RETURN candidate;
END
$$;--> statement-breakpoint
ALTER TABLE "branches" ALTER COLUMN "public_id" SET DEFAULT "nnact_new_branch_public_id"();--> statement-breakpoint
INSERT INTO "branches" ("org_id", "public_id", "name", "is_default")
SELECT o."id", "nnact_new_branch_public_id"('Main Branch'), 'Main Branch', true
FROM "orgs" o
WHERE NOT EXISTS (SELECT 1 FROM "branches" b WHERE b."org_id" = o."id" AND b."is_default");--> statement-breakpoint
CREATE OR REPLACE FUNCTION "nnact_create_default_branch"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	INSERT INTO "branches" ("org_id", "public_id", "name", "is_default")
	VALUES (NEW."id", "nnact_new_branch_public_id"('Main Branch'), 'Main Branch', true)
	ON CONFLICT DO NOTHING;
	RETURN NEW;
END
$$;--> statement-breakpoint
DROP TRIGGER IF EXISTS "orgs_default_branch" ON "orgs";--> statement-breakpoint
CREATE TRIGGER "orgs_default_branch" AFTER INSERT ON "orgs" FOR EACH ROW EXECUTE FUNCTION "nnact_create_default_branch"();
