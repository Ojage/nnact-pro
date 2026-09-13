CREATE TYPE "public"."advance_status" AS ENUM('REQUESTED', 'APPROVED', 'DISBURSED', 'PARTIALLY_SETTLED', 'SETTLED', 'OVERDUE', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."bill_frequency" AS ENUM('WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY');--> statement-breakpoint
CREATE TYPE "public"."bill_status" AS ENUM('DRAFT', 'RECEIVED', 'APPROVED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'DISPUTED', 'VOIDED');--> statement-breakpoint
CREATE TYPE "public"."expense_status" AS ENUM('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'PAID', 'VOIDED');--> statement-breakpoint
CREATE TYPE "public"."finance_payment_method" AS ENUM('CASH', 'MTN_MOBILE_MONEY', 'ORANGE_MONEY', 'BANK_TRANSFER', 'CARD', 'CHEQUE', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."job_line_cost_class" AS ENUM('revenue', 'cost', 'neither');--> statement-breakpoint
CREATE TYPE "public"."petty_cash_kind" AS ENUM('DEPOSIT', 'EXPENSE', 'TOP_UP', 'CLOSEOUT');--> statement-breakpoint
CREATE TYPE "public"."reimbursement_status" AS ENUM('SUBMITTED', 'APPROVED', 'PAID', 'REJECTED');--> statement-breakpoint
CREATE TABLE "advance_settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"advance_id" uuid NOT NULL,
	"settled_cents" integer NOT NULL,
	"description" text,
	"expense_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"settled_by" uuid,
	"settled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bill_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"bill_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"method" "finance_payment_method" DEFAULT 'BANK_TRANSFER' NOT NULL,
	"reference" text,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"budget_id" uuid NOT NULL,
	"category_id" uuid,
	"planned_cents" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"period" text NOT NULL,
	"label" text,
	"cost_center_id" uuid,
	"created_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cash_advances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"number" text NOT NULL,
	"employee_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"reason" text,
	"required_for_job_id" uuid,
	"category_id" uuid,
	"cost_center_id" uuid,
	"status" "advance_status" DEFAULT 'REQUESTED' NOT NULL,
	"approve_by" uuid,
	"approved_at" timestamp with time zone,
	"disbursed_by" uuid,
	"disbursed_at" timestamp with time zone,
	"settlement_due_at" timestamp with time zone,
	"settled_cents" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"cancel_reason" text,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cost_centers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"description" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expense_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"number" text NOT NULL,
	"employee_id" uuid NOT NULL,
	"created_by" uuid,
	"category_id" uuid,
	"cost_center_id" uuid,
	"job_id" uuid,
	"equipment_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"amount_cents" integer NOT NULL,
	"momo_fee_cents" integer DEFAULT 0 NOT NULL,
	"payment_method" "finance_payment_method" DEFAULT 'CASH' NOT NULL,
	"receipt_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "expense_status" DEFAULT 'DRAFT' NOT NULL,
	"submitted_at" timestamp with time zone,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"rejection_reason" text,
	"paid_at" timestamp with time zone,
	"paid_by" uuid,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_line_items_finance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"line_item_id" uuid NOT NULL,
	"cost_class" "job_line_cost_class" DEFAULT 'revenue' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "petty_cash_funds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"custodian_id" uuid,
	"opening_balance_cents" integer DEFAULT 0 NOT NULL,
	"current_balance_cents" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"closed_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "petty_cash_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"fund_id" uuid NOT NULL,
	"kind" "petty_cash_kind" NOT NULL,
	"amount_cents" integer NOT NULL,
	"category_id" uuid,
	"cost_center_id" uuid,
	"description" text,
	"happened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recurring_bills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"supplier_name" text NOT NULL,
	"supplier_reference" text,
	"category_id" uuid,
	"cost_center_id" uuid,
	"job_id" uuid,
	"frequency" "bill_frequency" DEFAULT 'MONTHLY' NOT NULL,
	"day_of_month" integer DEFAULT 1 NOT NULL,
	"next_due_on" timestamp with time zone NOT NULL,
	"sub_total_cents" integer NOT NULL,
	"tax_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_generated_at" timestamp with time zone,
	"notes" text,
	"created_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reimbursements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"number" text NOT NULL,
	"employee_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"job_id" uuid,
	"receipt_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "reimbursement_status" DEFAULT 'SUBMITTED' NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"rejection_reason" text,
	"paid_at" timestamp with time zone,
	"paid_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_bill_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"bill_id" uuid NOT NULL,
	"description" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"amount_cents" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_bills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"number" text NOT NULL,
	"supplier_name" text NOT NULL,
	"supplier_reference" text,
	"category_id" uuid,
	"cost_center_id" uuid,
	"job_id" uuid,
	"issue_date" timestamp with time zone NOT NULL,
	"due_date" timestamp with time zone,
	"status" "bill_status" DEFAULT 'DRAFT' NOT NULL,
	"sub_total_cents" integer NOT NULL,
	"tax_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer NOT NULL,
	"paid_cents" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "advance_settlements" ADD CONSTRAINT "advance_settlements_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advance_settlements" ADD CONSTRAINT "advance_settlements_advance_id_cash_advances_id_fk" FOREIGN KEY ("advance_id") REFERENCES "public"."cash_advances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advance_settlements" ADD CONSTRAINT "advance_settlements_settled_by_users_id_fk" FOREIGN KEY ("settled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_payments" ADD CONSTRAINT "bill_payments_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_payments" ADD CONSTRAINT "bill_payments_bill_id_supplier_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."supplier_bills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_payments" ADD CONSTRAINT "bill_payments_paid_by_users_id_fk" FOREIGN KEY ("paid_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_budget_id_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budgets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_category_id_expense_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."expense_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_cost_center_id_cost_centers_id_fk" FOREIGN KEY ("cost_center_id") REFERENCES "public"."cost_centers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_advances" ADD CONSTRAINT "cash_advances_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_advances" ADD CONSTRAINT "cash_advances_employee_id_users_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_advances" ADD CONSTRAINT "cash_advances_required_for_job_id_jobs_id_fk" FOREIGN KEY ("required_for_job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_advances" ADD CONSTRAINT "cash_advances_category_id_expense_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."expense_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_advances" ADD CONSTRAINT "cash_advances_cost_center_id_cost_centers_id_fk" FOREIGN KEY ("cost_center_id") REFERENCES "public"."cost_centers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_advances" ADD CONSTRAINT "cash_advances_approve_by_users_id_fk" FOREIGN KEY ("approve_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_advances" ADD CONSTRAINT "cash_advances_disbursed_by_users_id_fk" FOREIGN KEY ("disbursed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_centers" ADD CONSTRAINT "cost_centers_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_centers" ADD CONSTRAINT "cost_centers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_employee_id_users_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_expense_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."expense_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_cost_center_id_cost_centers_id_fk" FOREIGN KEY ("cost_center_id") REFERENCES "public"."cost_centers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_paid_by_users_id_fk" FOREIGN KEY ("paid_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_line_items_finance" ADD CONSTRAINT "job_line_items_finance_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_line_items_finance" ADD CONSTRAINT "job_line_items_finance_line_item_id_line_items_id_fk" FOREIGN KEY ("line_item_id") REFERENCES "public"."line_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "petty_cash_funds" ADD CONSTRAINT "petty_cash_funds_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "petty_cash_funds" ADD CONSTRAINT "petty_cash_funds_custodian_id_users_id_fk" FOREIGN KEY ("custodian_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "petty_cash_transactions" ADD CONSTRAINT "petty_cash_transactions_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "petty_cash_transactions" ADD CONSTRAINT "petty_cash_transactions_fund_id_petty_cash_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."petty_cash_funds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "petty_cash_transactions" ADD CONSTRAINT "petty_cash_transactions_category_id_expense_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."expense_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "petty_cash_transactions" ADD CONSTRAINT "petty_cash_transactions_cost_center_id_cost_centers_id_fk" FOREIGN KEY ("cost_center_id") REFERENCES "public"."cost_centers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "petty_cash_transactions" ADD CONSTRAINT "petty_cash_transactions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_bills" ADD CONSTRAINT "recurring_bills_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_bills" ADD CONSTRAINT "recurring_bills_category_id_expense_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."expense_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_bills" ADD CONSTRAINT "recurring_bills_cost_center_id_cost_centers_id_fk" FOREIGN KEY ("cost_center_id") REFERENCES "public"."cost_centers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_bills" ADD CONSTRAINT "recurring_bills_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_bills" ADD CONSTRAINT "recurring_bills_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reimbursements" ADD CONSTRAINT "reimbursements_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reimbursements" ADD CONSTRAINT "reimbursements_employee_id_users_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reimbursements" ADD CONSTRAINT "reimbursements_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reimbursements" ADD CONSTRAINT "reimbursements_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reimbursements" ADD CONSTRAINT "reimbursements_paid_by_users_id_fk" FOREIGN KEY ("paid_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_bill_lines" ADD CONSTRAINT "supplier_bill_lines_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_bill_lines" ADD CONSTRAINT "supplier_bill_lines_bill_id_supplier_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."supplier_bills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_bills" ADD CONSTRAINT "supplier_bills_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_bills" ADD CONSTRAINT "supplier_bills_category_id_expense_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."expense_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_bills" ADD CONSTRAINT "supplier_bills_cost_center_id_cost_centers_id_fk" FOREIGN KEY ("cost_center_id") REFERENCES "public"."cost_centers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_bills" ADD CONSTRAINT "supplier_bills_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_bills" ADD CONSTRAINT "supplier_bills_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "advance_settlements_org_advance_idx" ON "advance_settlements" USING btree ("org_id","advance_id");--> statement-breakpoint
CREATE INDEX "bill_payments_org_bill_idx" ON "bill_payments" USING btree ("org_id","bill_id");--> statement-breakpoint
CREATE INDEX "budget_lines_org_budget_idx" ON "budget_lines" USING btree ("org_id","budget_id");--> statement-breakpoint
CREATE UNIQUE INDEX "budget_lines_budget_category_idx" ON "budget_lines" USING btree ("budget_id","category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "budgets_org_period_center_idx" ON "budgets" USING btree ("org_id","period","cost_center_id");--> statement-breakpoint
CREATE INDEX "cash_advances_org_status_idx" ON "cash_advances" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "cash_advances_org_employee_idx" ON "cash_advances" USING btree ("org_id","employee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cash_advances_org_number_idx" ON "cash_advances" USING btree ("org_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "cost_centers_org_name_idx" ON "cost_centers" USING btree ("org_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "expense_categories_org_name_idx" ON "expense_categories" USING btree ("org_id","name");--> statement-breakpoint
CREATE INDEX "expenses_org_status_idx" ON "expenses" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "expenses_org_employee_idx" ON "expenses" USING btree ("org_id","employee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "expenses_org_number_idx" ON "expenses" USING btree ("org_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "job_line_items_finance_org_line_item_idx" ON "job_line_items_finance" USING btree ("org_id","line_item_id");--> statement-breakpoint
CREATE INDEX "petty_cash_funds_org_status_idx" ON "petty_cash_funds" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "petty_cash_transactions_org_fund_idx" ON "petty_cash_transactions" USING btree ("org_id","fund_id");--> statement-breakpoint
CREATE INDEX "recurring_bills_org_active_idx" ON "recurring_bills" USING btree ("org_id","active");--> statement-breakpoint
CREATE INDEX "reimbursements_org_status_idx" ON "reimbursements" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "reimbursements_org_employee_idx" ON "reimbursements" USING btree ("org_id","employee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reimbursements_org_number_idx" ON "reimbursements" USING btree ("org_id","number");--> statement-breakpoint
CREATE INDEX "supplier_bill_lines_org_bill_idx" ON "supplier_bill_lines" USING btree ("org_id","bill_id");--> statement-breakpoint
CREATE INDEX "supplier_bills_org_status_idx" ON "supplier_bills" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "supplier_bills_org_due_idx" ON "supplier_bills" USING btree ("org_id","due_date");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_bills_org_number_idx" ON "supplier_bills" USING btree ("org_id","number");--> statement-breakpoint
CREATE INDEX "supplier_bills_org_supplier_idx" ON "supplier_bills" USING btree ("org_id","supplier_name");