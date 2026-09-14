ALTER TABLE "customers" ADD COLUMN "company" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "line_items" ADD COLUMN "unit" text;--> statement-breakpoint
ALTER TABLE "estimates" ADD COLUMN "accepted_method" text;--> statement-breakpoint
ALTER TABLE "estimates" ADD COLUMN "scope" text;--> statement-breakpoint
ALTER TABLE "estimates" ADD COLUMN "internal_notes" text;--> statement-breakpoint
ALTER TABLE "estimates" ADD COLUMN "recommendations" text;--> statement-breakpoint
ALTER TABLE "estimates" ADD COLUMN "exclusions" text;--> statement-breakpoint
ALTER TABLE "estimates" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "estimate_options" ADD COLUMN "recommended" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "estimate_option_line_items" ADD COLUMN "unit" text;--> statement-breakpoint
ALTER TABLE "estimate_option_line_items" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "estimate_id" uuid;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD COLUMN "unit" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_estimate_id_estimates_id_fk" FOREIGN KEY ("estimate_id") REFERENCES "public"."estimates"("id") ON DELETE set null ON UPDATE no action;
