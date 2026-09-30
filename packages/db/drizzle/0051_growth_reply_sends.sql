-- Staff replies to inbound conversations are outbound messages with no campaign
-- step behind them, and their thread may predate any campaign. Three columns
-- were NOT NULL, which made it impossible to record a reply in the auditable
-- send log at all — replies had to bypass the log entirely, losing the audit
-- trail, the suppression check and bounce attribution.
ALTER TABLE "growth_outbound_messages" ALTER COLUMN "campaign_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "growth_outbound_messages" ALTER COLUMN "step_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "growth_outbound_messages" ALTER COLUMN "recipient_id" DROP NOT NULL;--> statement-breakpoint
-- The new enum value is added last and not used by any DML in this migration:
-- PostgreSQL cannot use an enum value added in the same transaction.
DO $$ BEGIN
  ALTER TYPE "growth_campaign_purpose" ADD VALUE IF NOT EXISTS 'REPLY';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
-- Attribution for hand-written replies: null for automated campaign sends,
-- which are attributed to the campaign instead. The send log can therefore
-- always distinguish a person writing from the scheduler writing.
ALTER TABLE "growth_outbound_messages" ADD COLUMN "sent_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "growth_outbound_messages" ADD CONSTRAINT "growth_outbound_messages_sent_by_user_id_fkey" FOREIGN KEY ("sent_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL;
