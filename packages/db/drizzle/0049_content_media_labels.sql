ALTER TABLE "content_media" ADD COLUMN "use_for" text;--> statement-breakpoint
ALTER TABLE "content_media" ADD COLUMN "tags" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "content_media" ADD COLUMN "archived" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "content_media" ADD COLUMN "ai_prompt" text;--> statement-breakpoint
CREATE INDEX "content_media_gallery_idx" ON "content_media" USING btree ("org_id","archived","created_at");--> statement-breakpoint
CREATE INDEX "content_media_use_for_idx" ON "content_media" USING btree ("org_id","use_for");--> statement-breakpoint
CREATE INDEX "content_media_tags_idx" ON "content_media" USING gin ("tags");--> statement-breakpoint
