-- Price Book + Quoting Agent. Money stays integer cents (XAF).
-- Enum values are created before tables and are not used by DML in this migration.
DO $$ BEGIN
  CREATE TYPE "price_observation_source" AS ENUM ('receipt', 'manual', 'historical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "price_observation_status" AS ENUM ('pending', 'confirmed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "price_book_rate_kind" AS ENUM ('labor', 'transport', 'diagnostic');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "quote_proposal_status" AS ENUM ('draft', 'approved', 'rejected', 'superseded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "quote_line_kind" AS ENUM ('part', 'labor', 'transport', 'diagnostic');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "price_book_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL REFERENCES "orgs"("id") ON DELETE cascade,
	"name" text NOT NULL,
	"freshness_days" integer DEFAULT 30 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "price_book_categories_org_name_idx" ON "price_book_categories" ("org_id", "name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "price_book_categories_org_active_idx" ON "price_book_categories" ("org_id", "active");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "price_book_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL REFERENCES "orgs"("id") ON DELETE cascade,
	"category_id" uuid NOT NULL REFERENCES "price_book_categories"("id") ON DELETE cascade,
	"canonical_name" text NOT NULL,
	"unit" text DEFAULT 'piece' NOT NULL,
	"aliases" jsonb DEFAULT '{"en":[],"fr":[]}'::jsonb NOT NULL,
	"catalog_item_id" uuid REFERENCES "catalog_items"("id") ON DELETE set null,
	"suggested" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "price_book_items_org_name_idx" ON "price_book_items" ("org_id", "canonical_name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "price_book_items_org_active_idx" ON "price_book_items" ("org_id", "active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "price_book_items_category_idx" ON "price_book_items" ("category_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "price_book_items_catalog_idx" ON "price_book_items" ("catalog_item_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "price_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL REFERENCES "orgs"("id") ON DELETE cascade,
	"item_id" uuid NOT NULL REFERENCES "price_book_items"("id") ON DELETE cascade,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'XAF' NOT NULL,
	"shop_name" text,
	"area" text,
	"source" "price_observation_source" DEFAULT 'manual' NOT NULL,
	"status" "price_observation_status" DEFAULT 'confirmed' NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"job_id" uuid REFERENCES "jobs"("id") ON DELETE set null,
	"recorded_by" uuid REFERENCES "users"("id") ON DELETE set null,
	"confidence" integer DEFAULT 80 NOT NULL,
	"receipt_media_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "price_observations_org_item_observed_idx" ON "price_observations" ("org_id", "item_id", "observed_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "price_observations_org_status_idx" ON "price_observations" ("org_id", "status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "price_observations_job_idx" ON "price_observations" ("job_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "price_book_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL REFERENCES "orgs"("id") ON DELETE cascade,
	"kind" "price_book_rate_kind" NOT NULL,
	"key" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "price_book_rates_org_kind_key_idx" ON "price_book_rates" ("org_id", "kind", "key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "price_book_rates_org_active_idx" ON "price_book_rates" ("org_id", "active");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "quote_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL REFERENCES "orgs"("id") ON DELETE cascade,
	"job_id" uuid NOT NULL REFERENCES "jobs"("id") ON DELETE cascade,
	"status" "quote_proposal_status" DEFAULT 'draft' NOT NULL,
	"agent_run_id" uuid REFERENCES "agent_runs"("id") ON DELETE set null,
	"low_cents" integer,
	"high_cents" integer,
	"confidence" integer DEFAULT 0 NOT NULL,
	"assumptions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"missing_information" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"model" text,
	"reviewed_by" uuid REFERENCES "users"("id") ON DELETE set null,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "quote_proposals_job_idx" ON "quote_proposals" ("job_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quote_proposals_org_status_idx" ON "quote_proposals" ("org_id", "status");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "quote_proposal_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL REFERENCES "orgs"("id") ON DELETE cascade,
	"proposal_id" uuid NOT NULL REFERENCES "quote_proposals"("id") ON DELETE cascade,
	"kind" "quote_line_kind" NOT NULL,
	"item_id" uuid REFERENCES "price_book_items"("id") ON DELETE set null,
	"rate_id" uuid REFERENCES "price_book_rates"("id") ON DELETE set null,
	"description" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit" text DEFAULT 'piece' NOT NULL,
	"unit_price_low_cents" integer,
	"unit_price_high_cents" integer,
	"line_low_cents" integer,
	"line_high_cents" integer,
	"final_unit_price_cents" integer,
	"confidence" integer DEFAULT 0 NOT NULL,
	"source" jsonb NOT NULL,
	"needs_manual_price" boolean DEFAULT false NOT NULL,
	"stale" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quote_proposal_lines_proposal_idx" ON "quote_proposal_lines" ("proposal_id");
