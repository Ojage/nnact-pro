ALTER TABLE "jobs" ADD COLUMN "advance_received_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "customer_balance_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "expense_allowance_cents" integer DEFAULT 0 NOT NULL;