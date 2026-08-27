CREATE TABLE IF NOT EXISTS "customer_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" text NOT NULL,
  "name" text NOT NULL,
  "password_hash" text NOT NULL,
  "email_verified_at" timestamp with time zone,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "customer_accounts_email_idx" ON "customer_accounts" (lower("email"));

CREATE TABLE IF NOT EXISTS "customer_account_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "orgs"("id") ON DELETE cascade,
  "customer_id" uuid NOT NULL REFERENCES "customers"("id") ON DELETE cascade,
  "account_id" uuid NOT NULL REFERENCES "customer_accounts"("id") ON DELETE cascade,
  "linked_via" text DEFAULT 'signup' NOT NULL,
  "linked_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "customer_account_links_org_customer_idx" ON "customer_account_links" ("org_id", "customer_id");
CREATE UNIQUE INDEX IF NOT EXISTS "customer_account_links_org_account_idx" ON "customer_account_links" ("org_id", "account_id");

CREATE TABLE IF NOT EXISTS "auth_refresh_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "subject_type" text NOT NULL,
  "subject_id" uuid NOT NULL,
  "token_hash" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "revoked_at" timestamp with time zone,
  "replaced_by_id" uuid,
  "user_agent" text,
  "ip_address" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "auth_refresh_tokens_hash_idx" ON "auth_refresh_tokens" ("token_hash");
CREATE INDEX IF NOT EXISTS "auth_refresh_tokens_subject_idx" ON "auth_refresh_tokens" ("subject_type", "subject_id");

CREATE UNIQUE INDEX IF NOT EXISTS "users_email_global_idx" ON "users" (lower("email"));
