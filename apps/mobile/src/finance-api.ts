// Finance API client for the mobile tech-finance flows. Standalone and
// intentionally kept separate from the colleague's in-progress screens.
import type { StoredStaffSession } from "./auth-storage";
import { staffFetch } from "./auth-api";
import type {
  CashAdvanceDTO,
  ExpenseDTO,
  FinanceDashboardDTO,
  SupplierBillDTO,
} from "@nnact/shared";

export function listExpenses(session: StoredStaffSession): Promise<ExpenseDTO[]> {
  return staffFetch<ExpenseDTO[]>(session, "/api/finance/expenses");
}

export function createExpense(
  session: StoredStaffSession,
  body: {
    title: string;
    amountCents: number;
    momoFeeCents?: number;
    paymentMethod?: string;
    jobId?: string | null;
    submitImmediately?: boolean;
  },
): Promise<ExpenseDTO> {
  return staffFetch<ExpenseDTO>(session, "/api/finance/expenses", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function transitionExpense(
  session: StoredStaffSession,
  id: string,
  action: "submit" | "pay" | "void" | "review",
  body?: Record<string, unknown>,
): Promise<ExpenseDTO> {
  return staffFetch<ExpenseDTO>(session, `/api/finance/expenses/${id}/${action}`, {
    method: "POST",
    body: JSON.stringify(body ?? {}),
  });
}

export function listAdvances(session: StoredStaffSession): Promise<CashAdvanceDTO[]> {
  return staffFetch<CashAdvanceDTO[]>(session, "/api/finance/advances");
}

export function createAdvance(
  session: StoredStaffSession,
  body: { amountCents: number; reason?: string; settlementDueAt?: string },
): Promise<CashAdvanceDTO> {
  return staffFetch<CashAdvanceDTO>(session, "/api/finance/advances", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function settleAdvance(
  session: StoredStaffSession,
  id: string,
  body: { settledCents: number; description?: string | null },
): Promise<CashAdvanceDTO> {
  return staffFetch<CashAdvanceDTO>(session, `/api/finance/advances/${id}/settle`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function listBills(session: StoredStaffSession): Promise<SupplierBillDTO[]> {
  return staffFetch<SupplierBillDTO[]>(session, "/api/finance/bills");
}

export function financeDashboard(session: StoredStaffSession): Promise<FinanceDashboardDTO> {
  return staffFetch<FinanceDashboardDTO>(session, "/api/finance/dashboard");
}