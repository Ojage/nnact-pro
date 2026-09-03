ALTER TABLE "content_items" ADD COLUMN "body_document" jsonb;--> statement-breakpoint
ALTER TABLE "content_items" ADD COLUMN "body_html" text;--> statement-breakpoint
ALTER TABLE "content_items" ADD COLUMN "body_markdown" text;
