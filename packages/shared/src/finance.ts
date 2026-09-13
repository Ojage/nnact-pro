// NNACT Pro Finance module — DTO types shared by api, web, and mobile.
// All money fields are integer cents (see `Money` in index.ts).

export const EXPENSE_STATUS = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "APPROVED",
  "REJECTED",
  "PAID",
  "VOIDED",
] as const;
export type ExpenseStatus = (typeof EXPENSE_STATUS)[number];

export const FINANCE_PAYMENT_METHODS = [
  "CASH",
  "MTN_MOBILE_MONEY",
  "ORANGE_MONEY",
  "BANK_TRANSFER",
  "CARD",
  "CHEQUE",
  "OTHER",
] as const;
export type FinancePaymentMethod = (typeof FINANCE_PAYMENT_METHODS)[number];

export const BILL_STATUS = [
  "DRAFT",
  "RECEIVED",
  "APPROVED",
  "PARTIALLY_PAID",
  "PAID",
  "OVERDUE",
  "DISPUTED",
  "VOIDED",
] as const;
export type BillStatus = (typeof BILL_STATUS)[number];

export const BILL_FREQUENCY = ["WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"] as const;
export type BillFrequency = (typeof BILL_FREQUENCY)[number];

export const ADVANCE_STATUS = [
  "REQUESTED",
  "APPROVED",
  "DISBURSED",
  "PARTIALLY_SETTLED",
  "SETTLED",
  "OVERDUE",
  "CANCELLED",
] as const;
export type AdvanceStatus = (typeof ADVANCE_STATUS)[number];

export const REIMBURSEMENT_STATUS = ["SUBMITTED", "APPROVED", "PAID", "REJECTED"] as const;
export type ReimbursementStatus = (typeof REIMBURSEMENT_STATUS)[number];

export const PETTY_CASH_KIND = ["DEPOSIT", "EXPENSE", "TOP_UP", "CLOSEOUT"] as const;
export type PettyCashKind = (typeof PETTY_CASH_KIND)[number];

export const JOB_LINE_COST_CLASS = ["revenue", "cost", "neither"] as const;
export type JobLineCostClass = (typeof JOB_LINE_COST_CLASS)[number];

export const EXPENSE_DEFAULT_CATEGORIES = [
  "Fuel",
  "Transportation",
  "Labels & print",
  "Equipment & supplies",
  "Tools & equipment",
  "Rental",
  "Licenses & fees",
  "Repairs & maintenance",
  "Professional fees",
  "Consumables",
  "Software & subscriptions",
  "Miscellaneous",
] as const;

export const DEFAULT_COST_CENTERS = [
  { name: "Operations", code: "OPS" },
  { name: "Field Tech", code: "TECH" },
  { name: "Administration", code: "ADMIN" },
  { name: "Sales & Marketing", code: "MKT" },
] as const;

export interface ExpenseCategoryDTO {
  id: string;
  name: string;
}

export interface CostCenterDTO {
  id: string;
  name: string;
  code?: string | null;
  description?: string | null;
}

export interface ExpenseDTO {
  id: string;
  number: string;
  employeeId: string;
  employeeName?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  costCenterId?: string | null;
  costCenterName?: string | null;
  jobId?: string | null;
  jobNumber?: string | null;
  title: string;
  description?: string | null;
  amountCents: number;
  momoFeeCents: number;
  paymentMethod: FinancePaymentMethod;
  receiptUrls: string[];
  status: ExpenseStatus;
  submittedAt?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  rejectionReason?: string | null;
  paidAt?: string | null;
  voidedAt?: string | null;
  voidReason?: string | null;
  version: number;
  /** Advisory budget guard result surfaced at creation time (non-blocking). */
  budgetWarning?: { level: "ok" | "warning" | "critical"; usedPercent?: number } | null;
  createdAt: string;
}

export interface SupplierBillLineDTO {
  id: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  amountCents: number;
}

export interface SupplierBillDTO {
  id: string;
  number: string;
  supplierName: string;
  supplierReference?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  costCenterId?: string | null;
  costCenterName?: string | null;
  jobId?: string | null;
  jobNumber?: string | null;
  issueDate: string;
  dueDate?: string | null;
  status: BillStatus;
  subTotalCents: number;
  taxCents: number;
  totalCents: number;
  paidCents: number;
  balanceCents: number;
  notes?: string | null;
  approvedAt?: string | null;
  voidedAt?: string | null;
  voidReason?: string | null;
  /** True when an existing (org, supplierName, supplierReference) bill matches. */
  duplicate?: boolean;
  lines: SupplierBillLineDTO[];
  payments: BillPaymentDTO[];
  version: number;
  createdAt: string;
}

export interface BillPaymentDTO {
  id: string;
  billId: string;
  amountCents: number;
  method: FinancePaymentMethod;
  reference?: string | null;
  paidAt: string;
}

export interface RecurringBillDTO {
  id: string;
  supplierName: string;
  supplierReference?: string | null;
  categoryId?: string | null;
  costCenterId?: string | null;
  jobId?: string | null;
  frequency: BillFrequency;
  dayOfMonth: number;
  nextDueOn: string;
  subTotalCents: number;
  taxCents: number;
  totalCents: number;
  active: boolean;
  lastGeneratedAt?: string | null;
  notes?: string | null;
  createdAt: string;
}

export interface AdvanceSettlementDTO {
  id: string;
  advanceId: string;
  settledCents: number;
  description?: string | null;
  expenseIds: string[];
  settledByName?: string | null;
  settledAt: string;
}

export interface CashAdvanceDTO {
  id: string;
  number: string;
  employeeId: string;
  employeeName?: string | null;
  amountCents: number;
  reason?: string | null;
  requiredForJobId?: string | null;
  jobNumber?: string | null;
  categoryId?: string | null;
  costCenterId?: string | null;
  status: AdvanceStatus;
  approvedAt?: string | null;
  disbursedAt?: string | null;
  settlementDueAt?: string | null;
  settledCents: number;
  outstandingCents: number;
  notes?: string | null;
  cancelReason?: string | null;
  settlements: AdvanceSettlementDTO[];
  version: number;
  createdAt: string;
}

export interface ReimbursementDTO {
  id: string;
  number: string;
  employeeId: string;
  employeeName?: string | null;
  amountCents: number;
  title: string;
  description?: string | null;
  jobId?: string | null;
  receiptUrls: string[];
  status: ReimbursementStatus;
  approvedAt?: string | null;
  rejectionReason?: string | null;
  paidAt?: string | null;
  version: number;
  createdAt: string;
}

export interface PettyCashFundDTO {
  id: string;
  name: string;
  custodianId?: string | null;
  custodianName?: string | null;
  openingBalanceCents: number;
  currentBalanceCents: number;
  status: string;
  closedAt?: string | null;
  createdAt: string;
}

export interface PettyCashTransactionDTO {
  id: string;
  fundId: string;
  kind: PettyCashKind;
  amountCents: number;
  categoryId?: string | null;
  costCenterId?: string | null;
  description?: string | null;
  happenedAt: string;
  createdAt: string;
}

export interface BudgetLineDTO {
  id: string;
  categoryId?: string | null;
  categoryName?: string | null;
  plannedCents: number;
  /** Actual (expenses + bill payments + petty cash + settled advances) in period. */
  actualCents: number;
  remainingCents: number;
  usedPercent: number;
  level: "ok" | "warning" | "critical";
}

export interface BudgetDTO {
  id: string;
  period: string;
  label?: string | null;
  costCenterId?: string | null;
  costCenterName?: string | null;
  totalPlannedCents: number;
  totalActualCents: number;
  totalUsedPercent: number;
  lines: BudgetLineDTO[];
  createdAt: string;
}

export interface FinanceDashboardDTO {
  currency: string;
  period: string;
  monthExpenseCents: number;
  monthBillPaidCents: number;
  monthTotalOutCents: number;
  billsPayableCents: number;
  billsOverdueCents: number;
  outstandingAdvanceCents: number;
  unsettledReimbursementCents: number;
  pettyCashBalanceCents: number;
  budgetPlannedCents: number;
  budgetActualCents: number;
  budgetUsedPercent: number;
  recentExpenses: ExpenseDTO[];
  recentBills: SupplierBillDTO[];
  budgetLines: BudgetLineDTO[];
}

export interface JobCostingDTO {
  jobId: string;
  jobNumber: string | null;
  title: string;
  customerName: string | null;
  status: string;
  revenueCents: number;
  directCostCents: number;
  expenseCents: number;
  billCents: number;
  laborCostCents: number;
  grossProfitCents: number;
  grossMarginPercent: number;
}

export interface ExpenseReportRowDTO {
  number: string;
  title: string;
  employeeName: string;
  categoryName: string;
  costCenterName: string;
  status: ExpenseStatus;
  amountCents: number;
  momoFeeCents: number;
  paymentMethod: FinancePaymentMethod;
  submittedAt?: string | null;
  paidAt?: string | null;
}

export interface BudgetAnalysisRowDTO {
  period: string;
  costCenterName: string | null;
  categoryName: string | null;
  plannedCents: number;
  actualCents: number;
  remainingCents: number;
  usedPercent: number;
}

export interface PayablesAgingRowDTO {
  number: string;
  supplierName: string;
  reference: string;
  status: BillStatus;
  totalCents: number;
  paidCents: number;
  balanceCents: number;
  dueDate: string | null;
  overdueDays: number;
}

/** Union of finance report rows; callers know which kind they requested. */
export type FinanceReportRowDTO =
  | ExpenseReportRowDTO[]
  | PayablesAgingRowDTO[]
  | BudgetAnalysisRowDTO[]
  | JobCostingDTO[];