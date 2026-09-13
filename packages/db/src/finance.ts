// NNACT Pro — Finance, budgeting, expenses & bills module.
// Multi-tenant (org_id everywhere). Money stored as integer cents — never floats.
//
// Module covers: expense categories, cost centers, employee expenses, supplier
// bills + payments (+ recurring bill templates), cash advances + settlements,
// reimbursements, petty cash funds + transactions, budgets + lines.
// All user-visible money lives here in integer cents; DTO layer in @nnact/shared
// converts to majors for formatting via MoneyInput.
//
// Lifecycle enums mirror the spec state machines:
//   expense:      DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED/REJECTED → PAID/VOIDED
//   bill:         DRAFT → RECEIVED → APPROVED → PARTIALLY_PAID → PAID / OVERDUE / DISPUTED / VOIDED
//   advance:      REQUESTED → APPROVED → DISBURSED → PARTIALLY_SETTLED → SETTLED / OVERDUE / CANCELLED
//   reimbursement:SUBMITTED → APPROVED → PAID / REJECTED

import { sql } from "drizzle-orm";
import {
  pgEnum,
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  boolean,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { orgs, users, jobs, equipment, lineItems } from "./schema.js";

const id = () => uuid("id").primaryKey().defaultRandom();
const orgId = () =>
  uuid("org_id")
    .notNull()
    .references(() => orgs.id, { onDelete: "cascade" });
const ts = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const version = () => integer("version").default(1).notNull();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).defaultNow().notNull();
const createdBy = () => uuid("created_by").references(() => users.id, { onDelete: "set null" });

// ────────────────────────────────────────────────────────────────────────────
// Enums
// ────────────────────────────────────────────────────────────────────────────

/** How money moved (settings.payments allows manual cash/check/card + MoMo). */
export const financePaymentMethod = pgEnum("finance_payment_method", [
  "CASH",
  "MTN_MOBILE_MONEY",
  "ORANGE_MONEY",
  "BANK_TRANSFER",
  "CARD",
  "CHEQUE",
  "OTHER",
]);

export const expenseStatus = pgEnum("expense_status", [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "APPROVED",
  "REJECTED",
  "PAID",
  "VOIDED",
]);

export const billStatus = pgEnum("bill_status", [
  "DRAFT",
  "RECEIVED",
  "APPROVED",
  "PARTIALLY_PAID",
  "PAID",
  "OVERDUE",
  "DISPUTED",
  "VOIDED",
]);

export const billFrequency = pgEnum("bill_frequency", [
  "WEEKLY",
  "MONTHLY",
  "QUARTERLY",
  "YEARLY",
]);

export const advanceStatus = pgEnum("advance_status", [
  "REQUESTED",
  "APPROVED",
  "DISBURSED",
  "PARTIALLY_SETTLED",
  "SETTLED",
  "OVERDUE",
  "CANCELLED",
]);

export const reimbursementStatus = pgEnum("reimbursement_status", [
  "SUBMITTED",
  "APPROVED",
  "PAID",
  "REJECTED",
]);

export const pettyCashKind = pgEnum("petty_cash_kind", [
  "DEPOSIT",
  "EXPENSE",
  "TOP_UP",
  "CLOSEOUT",
]);

// ────────────────────────────────────────────────────────────────────────────
// Lookups: expense categories & cost centers
// ────────────────────────────────────────────────────────────────────────────

export const expenseCategories = pgTable(
  "expense_categories",
  {
    id: id(),
    orgId: orgId(),
    name: text("name").notNull(),
    createdBy: createdBy(),
    createdAt: ts(),
  },
  (t) => ({
    orgName: uniqueIndex("expense_categories_org_name_idx").on(t.orgId, t.name),
  }),
);

export const costCenters = pgTable(
  "cost_centers",
  {
    id: id(),
    orgId: orgId(),
    name: text("name").notNull(),
    code: text("code"),
    description: text("description"),
    createdBy: createdBy(),
    createdAt: ts(),
  },
  (t) => ({
    orgName: uniqueIndex("cost_centers_org_name_idx").on(t.orgId, t.name),
  }),
);

// ────────────────────────────────────────────────────────────────────────────
// Employee expenses (technician/office cash-out, incl. mobile money fees)
// ────────────────────────────────────────────────────────────────────────────

export const expenses = pgTable(
  "expenses",
  {
    id: id(),
    orgId: orgId(),
    /** Human number, e.g. NNACT/EXP/2026/000123. */
    number: text("number").notNull(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    submittedById: createdBy(),
    categoryId: uuid("category_id").references(() => expenseCategories.id, { onDelete: "set null" }),
    costCenterId: uuid("cost_center_id").references(() => costCenters.id, { onDelete: "set null" }),
    jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
    equipmentId: uuid("equipment_id").references(() => equipment.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description"),
    amountCents: integer("amount_cents").notNull(),
    /** Mobile-money send fee paid by the business, recorded separately. */
    momoFeeCents: integer("momo_fee_cents").default(0).notNull(),
    paymentMethod: financePaymentMethod("payment_method").default("CASH").notNull(),
    /** Receipt photo/URL references (finance-receipt storage or external). */
    receiptUrls: jsonb("receipt_urls").$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
    status: expenseStatus("status").default("DRAFT").notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    rejectionReason: text("rejection_reason"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    paidBy: uuid("paid_by").references(() => users.id, { onDelete: "set null" }),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidReason: text("void_reason"),
    version: version(),
    updatedAt: updatedAt(),
    createdAt: ts(),
  },
  (t) => ({
    orgStatus: index("expenses_org_status_idx").on(t.orgId, t.status),
    orgEmployee: index("expenses_org_employee_idx").on(t.orgId, t.employeeId),
    orgNumber: uniqueIndex("expenses_org_number_idx").on(t.orgId, t.number),
  }),
);

// ────────────────────────────────────────────────────────────────────────────
// Supplier bills (payables) + line items + payments
// ────────────────────────────────────────────────────────────────────────────

export const supplierBills = pgTable(
  "supplier_bills",
  {
    id: id(),
    orgId: orgId(),
    /** Human number, e.g. NNACT/EXP/2026/000001 (BILL prefix). */
    number: text("number").notNull(),
    supplierName: text("supplier_name").notNull(),
    /** Supplier's own reference (their invoice/bill no) — duplicate-detection key. */
    supplierReference: text("supplier_reference"),
    categoryId: uuid("category_id").references(() => expenseCategories.id, { onDelete: "set null" }),
    costCenterId: uuid("cost_center_id").references(() => costCenters.id, { onDelete: "set null" }),
    jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
    issueDate: timestamp("issue_date", { withTimezone: true }).notNull(),
    dueDate: timestamp("due_date", { withTimezone: true }),
    status: billStatus("status").default("DRAFT").notNull(),
    subTotalCents: integer("sub_total_cents").notNull(),
    taxCents: integer("tax_cents").default(0).notNull(),
    totalCents: integer("total_cents").notNull(),
    /** Denormalized running total of bill_payments, maintained inside the advisory lock. */
    paidCents: integer("paid_cents").default(0).notNull(),
    notes: text("notes"),
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidReason: text("void_reason"),
    version: version(),
    updatedAt: updatedAt(),
    createdAt: ts(),
  },
  (t) => ({
    orgStatus: index("supplier_bills_org_status_idx").on(t.orgId, t.status),
    orgDue: index("supplier_bills_org_due_idx").on(t.orgId, t.dueDate),
    orgNumber: uniqueIndex("supplier_bills_org_number_idx").on(t.orgId, t.number),
    orgSupplier: index("supplier_bills_org_supplier_idx").on(t.orgId, t.supplierName),
  }),
);

export const supplierBillLines = pgTable(
  "supplier_bill_lines",
  {
    id: id(),
    orgId: orgId(),
    billId: uuid("bill_id")
      .notNull()
      .references(() => supplierBills.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    quantity: integer("quantity").default(1).notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
    amountCents: integer("amount_cents").notNull(),
    version: version(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    orgBill: index("supplier_bill_lines_org_bill_idx").on(t.orgId, t.billId),
  }),
);

export const billPayments = pgTable(
  "bill_payments",
  {
    id: id(),
    orgId: orgId(),
    billId: uuid("bill_id")
      .notNull()
      .references(() => supplierBills.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
    method: financePaymentMethod("method").default("BANK_TRANSFER").notNull(),
    reference: text("reference"),
    paidAt: timestamp("paid_at", { withTimezone: true }).defaultNow().notNull(),
    paidBy: uuid("paid_by").references(() => users.id, { onDelete: "set null" }),
    version: version(),
    createdAt: ts(),
  },
  (t) => ({
    orgBill: index("bill_payments_org_bill_idx").on(t.orgId, t.billId),
  }),
);

// ────────────────────────────────────────────────────────────────────────────
// Recurring bill templates (office manages; "generate next" materializes one)
// ────────────────────────────────────────────────────────────────────────────

export const recurringBills = pgTable(
  "recurring_bills",
  {
    id: id(),
    orgId: orgId(),
    supplierName: text("supplier_name").notNull(),
    supplierReference: text("supplier_reference"),
    categoryId: uuid("category_id").references(() => expenseCategories.id, { onDelete: "set null" }),
    costCenterId: uuid("cost_center_id").references(() => costCenters.id, { onDelete: "set null" }),
    jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
    frequency: billFrequency("frequency").default("MONTHLY").notNull(),
    /** 1–28 (or 29/30/31 = last day-of-month clamp). */
    dayOfMonth: integer("day_of_month").default(1).notNull(),
    nextDueOn: timestamp("next_due_on", { withTimezone: true }).notNull(),
    /** Billed on "goods received" — the fixed amount for a generated bill. */
    subTotalCents: integer("sub_total_cents").notNull(),
    taxCents: integer("tax_cents").default(0).notNull(),
    totalCents: integer("total_cents").notNull(),
    active: boolean("active").default(true).notNull(),
    lastGeneratedAt: timestamp("last_generated_at", { withTimezone: true }),
    notes: text("notes"),
    createdBy: createdBy(),
    version: version(),
    updatedAt: updatedAt(),
    createdAt: ts(),
  },
  (t) => ({
    orgActive: index("recurring_bills_org_active_idx").on(t.orgId, t.active),
  }),
);

// ────────────────────────────────────────────────────────────────────────────
// Cash advances + settlements (+ expense-link for cash-out settlement)
// ────────────────────────────────────────────────────────────────────────────

export const cashAdvances = pgTable(
  "cash_advances",
  {
    id: id(),
    orgId: orgId(),
    /** Human number, e.g. NNACT/ADV/2026/000001. */
    number: text("number").notNull(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
    reason: text("reason"),
    requiredForJobId: uuid("required_for_job_id").references(() => jobs.id, { onDelete: "set null" }),
    categoryId: uuid("category_id").references(() => expenseCategories.id, { onDelete: "set null" }),
    costCenterId: uuid("cost_center_id").references(() => costCenters.id, { onDelete: "set null" }),
    status: advanceStatus("status").default("REQUESTED").notNull(),
    approveBy: uuid("approve_by").references(() => users.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    disbursedBy: uuid("disbursed_by").references(() => users.id, { onDelete: "set null" }),
    disbursedAt: timestamp("disbursed_at", { withTimezone: true }),
    settlementDueAt: timestamp("settlement_due_at", { withTimezone: true }),
    /** Denormalized running sum of advance_settlements, maintained in tx. */
    settledCents: integer("settled_cents").default(0).notNull(),
    notes: text("notes"),
    cancelReason: text("cancel_reason"),
    version: version(),
    updatedAt: updatedAt(),
    createdAt: ts(),
  },
  (t) => ({
    orgStatus: index("cash_advances_org_status_idx").on(t.orgId, t.status),
    orgEmployee: index("cash_advances_org_employee_idx").on(t.orgId, t.employeeId),
    orgNumber: uniqueIndex("cash_advances_org_number_idx").on(t.orgId, t.number),
  }),
);

export const advanceSettlements = pgTable(
  "advance_settlements",
  {
    id: id(),
    orgId: orgId(),
    advanceId: uuid("advance_id")
      .notNull()
      .references(() => cashAdvances.id, { onDelete: "cascade" }),
    settledCents: integer("settled_cents").notNull(),
    description: text("description"),
    /** Expense ids reconciled into this settlement (cash returned via expenses). */
    expenseIds: jsonb("expense_ids").$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
    settledBy: uuid("settled_by").references(() => users.id, { onDelete: "set null" }),
    settledAt: timestamp("settled_at", { withTimezone: true }).defaultNow().notNull(),
    version: version(),
    createdAt: ts(),
  },
  (t) => ({
    orgAdvance: index("advance_settlements_org_advance_idx").on(t.orgId, t.advanceId),
  }),
);

// ────────────────────────────────────────────────────────────────────────────
// Reimbursements (employee already paid out of pocket)
// ────────────────────────────────────────────────────────────────────────────

export const reimbursements = pgTable(
  "reimbursements",
  {
    id: id(),
    orgId: orgId(),
    number: text("number").notNull(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
    receiptUrls: jsonb("receipt_urls").$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
    status: reimbursementStatus("status").default("SUBMITTED").notNull(),
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    rejectionReason: text("rejection_reason"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    paidBy: uuid("paid_by").references(() => users.id, { onDelete: "set null" }),
    version: version(),
    updatedAt: updatedAt(),
    createdAt: ts(),
  },
  (t) => ({
    orgStatus: index("reimbursements_org_status_idx").on(t.orgId, t.status),
    orgEmployee: index("reimbursements_org_employee_idx").on(t.orgId, t.employeeId),
    orgNumber: uniqueIndex("reimbursements_org_number_idx").on(t.orgId, t.number),
  }),
);

// ────────────────────────────────────────────────────────────────────────────
// Petty cash funds + transactions
// ────────────────────────────────────────────────────────────────────────────

export const pettyCashFunds = pgTable(
  "petty_cash_funds",
  {
    id: id(),
    orgId: orgId(),
    name: text("name").notNull(),
    custodianId: uuid("custodian_id").references(() => users.id, { onDelete: "set null" }),
    openingBalanceCents: integer("opening_balance_cents").default(0).notNull(),
    /** Derived ledger balance = opening + deposits + top-ups − expenses. */
    currentBalanceCents: integer("current_balance_cents").default(0).notNull(),
    status: text("status").default("active").notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    version: version(),
    updatedAt: updatedAt(),
    createdAt: ts(),
  },
  (t) => ({
    orgStatus: index("petty_cash_funds_org_status_idx").on(t.orgId, t.status),
  }),
);

export const pettyCashTransactions = pgTable(
  "petty_cash_transactions",
  {
    id: id(),
    orgId: orgId(),
    fundId: uuid("fund_id")
      .notNull()
      .references(() => pettyCashFunds.id, { onDelete: "cascade" }),
    kind: pettyCashKind("kind").notNull(),
    amountCents: integer("amount_cents").notNull(),
    categoryId: uuid("category_id").references(() => expenseCategories.id, { onDelete: "set null" }),
    costCenterId: uuid("cost_center_id").references(() => costCenters.id, { onDelete: "set null" }),
    description: text("description"),
    happenedAt: timestamp("happened_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: createdBy(),
    version: version(),
    createdAt: ts(),
  },
  (t) => ({
    orgFund: index("petty_cash_transactions_org_fund_idx").on(t.orgId, t.fundId),
  }),
);

// ────────────────────────────────────────────────────────────────────────────
// Budgets (a period-scoped bucket with per-category lines) — budget vs actual
// ────────────────────────────────────────────────────────────────────────────

export const budgets = pgTable(
  "budgets",
  {
    id: id(),
    orgId: orgId(),
    /** Period key "YYYY-MM". */
    period: text("period").notNull(),
    label: text("label"),
    costCenterId: uuid("cost_center_id").references(() => costCenters.id, { onDelete: "set null" }),
    createdBy: createdBy(),
    version: version(),
    updatedAt: updatedAt(),
    createdAt: ts(),
  },
  (t) => ({
    orgPeriodCenter: uniqueIndex("budgets_org_period_center_idx").on(t.orgId, t.period, t.costCenterId),
  }),
);

export const budgetLines = pgTable(
  "budget_lines",
  {
    id: id(),
    orgId: orgId(),
    budgetId: uuid("budget_id")
      .notNull()
      .references(() => budgets.id, { onDelete: "cascade" }),
    /** Null = whole budget bucket; otherwise per-category line. */
    categoryId: uuid("category_id").references(() => expenseCategories.id, { onDelete: "set null" }),
    plannedCents: integer("planned_cents").notNull(),
    version: version(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    orgBudget: index("budget_lines_org_budget_idx").on(t.orgId, t.budgetId),
    budgetCategory: uniqueIndex("budget_lines_budget_category_idx").on(t.budgetId, t.categoryId),
  }),
);

// ────────────────────────────────────────────────────────────────────────────
// Job-costing bridge — tune which invoice lines are treated as cost lines
// (revenue = invoice total; direct cost = costed line items + labor + job-bound
// expenses + job-bound bills; margin derived in the API layer).
// ────────────────────────────────────────────────────────────────────────────

/**
 * Explicit job-cost classification for an invoice line: "revenue" | "cost" |
 * "neither". Defaults to revenue for every existing line so legacy rows keep
 * counting toward revenue without a backfill. Only office roles may change it.
 */
export const jobLineCostClass = pgEnum("job_line_cost_class", ["revenue", "cost", "neither"]);

export const jobLineItemsFinance = pgTable(
  "job_line_items_finance",
  {
    id: id(),
    orgId: orgId(),
    /** Mirrors the shipped line-items table (schema.ts line_items). */
    lineItemId: uuid("line_item_id")
      .notNull()
      .references(() => lineItems.id, { onDelete: "cascade" }),
    costClass: jobLineCostClass("cost_class").default("revenue").notNull(),
    version: version(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    orgLineItem: uniqueIndex("job_line_items_finance_org_line_item_idx").on(t.orgId, t.lineItemId),
  }),
);