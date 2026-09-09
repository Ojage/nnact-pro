CREATE TABLE "verification_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purpose" text DEFAULT 'phone' NOT NULL,
	"channel" text NOT NULL,
	"target" text NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone_verified_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "verification_codes_target_purpose_idx" ON "verification_codes" USING btree ("target","purpose");--> statement-breakpoint
ALTER TABLE "customer_accounts" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "customer_accounts" ADD COLUMN "phone_verified_at" timestamp with time zone;--> statement-breakpoint
CREATE TABLE "etech_keys_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"base_url" text DEFAULT 'https://v1.api.etech-keys.com' NOT NULL,
	"legacy_base_url" text DEFAULT 'https://sms.etech-keys.com' NOT NULL,
	"username" text,
	"password" text,
	"api_key" text,
	"sender_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"provider_type" text DEFAULT 'etechkeys' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "etech_keys_settings_active_name_idx" ON "etech_keys_settings" USING btree ("name");