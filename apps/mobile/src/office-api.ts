// Office API client — the mobile home for owner / dispatcher / secretary work:
// dispatch & scheduling, customers & equipment, estimates & invoices, service
// plans & agreements, and finance review/record. Online-first (server-authoritative),
// intentionally separate from the offline field sync package.
import type { StoredStaffSession } from "./auth-storage";
import { staffFetch, staffFetchNoContent, getApiUrl } from "./auth-api";
import { apiErrorMessage } from "@nnact/shared";
import type {
  ArAgingReport,
  CreateTeamMemberResponseDTO,
  CustomerDTO,
  EstimateConversionReport,
  JobDTO,
  ReportSummaryDTO,
  RevenueTrendReport,
  ServiceAgreementDTO,
  ServicePlanDTO,
  TechnicianScorecardsReport,
  UserDTO,
} from "@nnact/shared";
import type {
  CashAdvanceDTO,
  ExpenseDTO,
  FinanceDashboardDTO,
  FinancePaymentMethod,
  PettyCashFundDTO,
  ReimbursementDTO,
  SupplierBillDTO,
} from "@nnact/shared";

// ── Local DTOs (mirror apps/web/lib/api.ts; kept out of shared intentionally) ──

export interface OfficeEquipment {
  id: string;
  orgId: string;
  customerId: string;
  type: string;
  make?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  installDate?: string | null;
  warrantyExpiry?: string | null;
  notes?: string | null;
  createdAt: string;
}

export interface OfficeEstimate {
  id: string;
  orgId: string;
  jobId: string;
  number: string;
  total: number;
  accepted: boolean;
  expiresAt?: string | null;
  acceptedAt?: string | null;
  acceptedByName?: string | null;
  acceptedMethod?: "signature" | "electronic" | "office_approve" | "office_accept" | null;
  status: "draft" | "sent" | "approved" | "declined" | "expired";
  selectedOptionId?: string | null;
  signatureName?: string | null;
  sentAt?: string | null;
  declinedAt?: string | null;
  copiedToJobAt?: string | null;
  revision?: number;
  scope?: string | null;
  internalNotes?: string | null;
  recommendations?: string | null;
  exclusions?: string | null;
  createdAt: string;
}

export interface OfficeInvoice {
  id: string;
  jobId: string;
  number: string;
  status: string;
  total: number;
  dueAt?: string | null;
  createdAt?: string;
}

export interface OfficeEstimateOption {
  id: string;
  estimateId: string;
  label: string;
  recommended: boolean;
  position: number;
  total: number;
  pricing?: { subtotal?: number; discount?: number; tax?: number; total?: number; taxLabel?: string; discountLabel?: string } | null;
  lineItems: Array<{ id: string; description: string; quantity: number; unitPrice: number; unit: string | null }>;
}

export interface OfficeEstimateDetail extends OfficeEstimate {
  options: OfficeEstimateOption[];
  lineItems: Array<{ id: string; description: string; quantity: number; unitPrice: number; unit: string | null }>;
  pricing?: { subtotal?: number; discount?: number; tax?: number; total?: number; taxLabel?: string; discountLabel?: string } | null;
  termsAndConditions?: string[] | null;
  warnings?: {
    identicalOptions: boolean;
    identicalOptionMessage: string | null;
    scopeGaps: string[];
  };
  deposit?: {
    requiredCents: number;
    collectedCents: number;
    remainingCents: number;
    collected: boolean;
    invoice: { id: string; number: string; status: string } | null;
  };
}

export interface OfficeInvoiceLine {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  position: number;
}

export interface OfficeInvoicePayment {
  id: string;
  invoiceId: string;
  amount: number;
  method: string;
  reference?: string | null;
  paidAt: string;
}

export interface OfficeInvoiceDetail extends OfficeInvoice {
  lineItems: OfficeInvoiceLine[];
  payments: OfficeInvoicePayment[];
}

export interface OfficeAppointment {
  id: string;
  jobId: string;
  technicianId: string | null;
  startsAt: string;
  endsAt: string;
  createdAt: string;
}

export interface OfficeOrgSettings {
  id: string;
  name: string;
  timezone: string;
  logoUrl?: string | null;
  brandColor?: string | null;
  documentFooter?: string | null;
  publicEmail?: string | null;
  publicPhone?: string | null;
  publicAddress?: string | null;
  registrationNumber?: string | null;
  documentCategory?: string | null;
  signatoryName?: string | null;
  signatoryTitle?: string | null;
  signatureUrl?: string | null;
  stampUrl?: string | null;
  documentTerms?: string[] | null;
  removeOpenFieldProAttribution?: boolean;
  businessSettings: Record<string, unknown>;
}

export function orgSettings(session: StoredStaffSession): Promise<OfficeOrgSettings> {
  return staffFetch<OfficeOrgSettings>(session, "/api/org/me");
}

// ── Web / org ──

export function listJobs(session: StoredStaffSession, take = 200): Promise<JobDTO[]> {
  return staffFetch<JobDTO[]>(session, `/api/jobs?take=${take}`);
}

export function createJob(
  session: StoredStaffSession,
  body: {
    customerId: string;
    title: string;
    description?: string;
    scheduledAt?: string;
  },
): Promise<JobDTO> {
  return staffFetch<JobDTO>(session, "/api/jobs", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function listCustomers(session: StoredStaffSession): Promise<CustomerDTO[]> {
  return staffFetch<CustomerDTO[]>(session, "/api/customers");
}

export function createCustomer(
  session: StoredStaffSession,
  body: { name: string; email?: string; phone?: string; notes?: string },
): Promise<CustomerDTO> {
  return staffFetch<CustomerDTO>(session, "/api/customers", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function listEquipment(session: StoredStaffSession, customerId: string): Promise<OfficeEquipment[]> {
  return staffFetch<OfficeEquipment[]>(session, `/api/equipment?customerId=${customerId}`);
}

export function createEquipment(
  session: StoredStaffSession,
  body: {
    customerId: string;
    type: string;
    make?: string;
    model?: string;
    serialNumber?: string;
    installDate?: string;
    warrantyExpiry?: string;
    notes?: string;
  },
): Promise<OfficeEquipment> {
  return staffFetch<OfficeEquipment>(session, "/api/equipment", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function listTeam(session: StoredStaffSession): Promise<UserDTO[]> {
  return staffFetch<UserDTO[]>(session, "/api/users");
}

export function createTeamMember(
  session: StoredStaffSession,
  body: { name: string; email: string; role: "dispatcher" | "secretary" | "technician" },
): Promise<CreateTeamMemberResponseDTO> {
  return staffFetch<CreateTeamMemberResponseDTO>(session, "/api/users", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function patchTeamMember(
  session: StoredStaffSession,
  userId: string,
  body: {
    name?: string;
    email?: string;
    phone?: string | null;
    role?: "owner" | "dispatcher" | "secretary" | "technician";
    active?: boolean;
    title?: string | null;
    about?: string | null;
  },
): Promise<UserDTO> {
  return staffFetch<UserDTO>(session, `/api/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function removeTeamMember(session: StoredStaffSession, userId: string): Promise<void> {
  return staffFetchNoContent(session, `/api/users/${userId}`, { method: "DELETE" });
}

/** Upload (or replace) a member's profile picture. Self or owner allowed. */
export async function uploadAvatar(
  session: StoredStaffSession,
  userId: string,
  localUri: string,
): Promise<UserDTO> {
  const formData = new FormData();
  const name = localUri.split("/").pop() ?? "avatar.jpg";
  formData.append("file", {
    uri: localUri,
    name,
    type: "image/jpeg",
  } as unknown as Blob);

  const response = await fetch(`${getApiUrl()}/api/users/${userId}/avatar`, {
    method: "POST",
    headers: { authorization: `Bearer ${session.accessToken}` },
    body: formData,
  });
  if (response.status === 401) throw new Error("session_expired");
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(apiErrorMessage(response.status, body));
  }
  return response.json() as Promise<UserDTO>;
}

/** Remove a member's profile picture. Self or owner allowed. Returns updated UserDTO. */
export function removeAvatar(session: StoredStaffSession, userId: string): Promise<UserDTO> {
  return staffFetch<UserDTO>(session, `/api/users/${userId}/avatar`, { method: "DELETE" });
}

/** Admin-only field updates on the organization (mirrors apps/web lib/api.ts). */
export function updateOrgSettings(
  session: StoredStaffSession,
  body: Partial<Pick<
    OfficeOrgSettings,
    "name" | "timezone" | "publicEmail" | "publicPhone" | "publicAddress" | "removeOpenFieldProAttribution"
  >> & { businessSettings?: Record<string, unknown> },
): Promise<OfficeOrgSettings> {
  return staffFetch<OfficeOrgSettings>(session, "/api/org/me", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

// ── Dispatch / schedule ──

export function createAppointment(
  session: StoredStaffSession,
  body: { jobId: string; technicianId?: string; startsAt: string; endsAt: string },
): Promise<OfficeAppointment> {
  return staffFetch<OfficeAppointment>(session, "/api/appointments", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function patchAppointment(
  session: StoredStaffSession,
  appointmentId: string,
  body: { technicianId?: string | null; startsAt?: string; endsAt?: string },
): Promise<OfficeAppointment> {
  return staffFetch<OfficeAppointment>(session, `/api/appointments/${appointmentId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function listAppointments(session: StoredStaffSession): Promise<OfficeAppointment[]> {
  return staffFetch<OfficeAppointment[]>(session, "/api/appointments");
}

export function patchJob(
  session: StoredStaffSession,
  jobId: string,
  data: Record<string, unknown>,
): Promise<JobDTO> {
  return staffFetch<JobDTO>(session, `/api/jobs/${jobId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

// ── Estimates ──

export function listEstimates(session: StoredStaffSession): Promise<OfficeEstimate[]> {
  return staffFetch<OfficeEstimate[]>(session, "/api/estimates");
}

export function getEstimate(session: StoredStaffSession, estimateId: string): Promise<OfficeEstimateDetail> {
  return staffFetch<OfficeEstimateDetail>(session, `/api/estimates/${estimateId}`);
}

export function createEstimate(session: StoredStaffSession, jobId: string): Promise<OfficeEstimateDetail> {
  return staffFetch<OfficeEstimateDetail>(session, "/api/estimates", {
    method: "POST",
    body: JSON.stringify({ jobId }),
  });
}

export function markEstimateSent(session: StoredStaffSession, estimateId: string): Promise<OfficeEstimate> {
  return staffFetch<OfficeEstimate>(session, `/api/estimates/${estimateId}/send`, { method: "POST" });
}

export function approveEstimateOption(
  session: StoredStaffSession,
  estimateId: string,
  optionId: string,
  signatureName?: string,
): Promise<OfficeEstimate> {
  return staffFetch<OfficeEstimate>(session, `/api/estimates/${estimateId}/approve`, {
    method: "POST",
    body: JSON.stringify({ optionId, ...(signatureName ? { signatureName } : {}) }),
  });
}

export function declineEstimate(session: StoredStaffSession, estimateId: string): Promise<OfficeEstimate> {
  return staffFetch<OfficeEstimate>(session, `/api/estimates/${estimateId}/decline`, { method: "POST" });
}

export function acceptEstimate(
  session: StoredStaffSession,
  estimateId: string,
  customerName?: string,
): Promise<OfficeEstimate & { jobStatus: string }> {
  return staffFetch<OfficeEstimate & { jobStatus: string }>(session, `/api/estimates/${estimateId}/accept`, {
    method: "POST",
    body: JSON.stringify(customerName ? { customerName } : {}),
  });
}

export function copyApprovedEstimateToJob(
  session: StoredStaffSession,
  estimateId: string,
): Promise<{ ok: boolean; total: number; alreadyCopied: boolean }> {
  return staffFetch<{ ok: boolean; total: number; alreadyCopied: boolean }>(
    session,
    `/api/estimates/${estimateId}/copy-approved-to-job`,
    { method: "POST" },
  );
}

// ── Invoices ──

export function listInvoices(session: StoredStaffSession): Promise<OfficeInvoice[]> {
  return staffFetch<OfficeInvoice[]>(session, "/api/invoices");
}

export function getInvoice(session: StoredStaffSession, invoiceId: string): Promise<OfficeInvoiceDetail> {
  return staffFetch<OfficeInvoiceDetail>(session, `/api/invoices/${invoiceId}`);
}

export function createInvoice(
  session: StoredStaffSession,
  body: { jobId: string; dueAt?: string; discountId?: string },
): Promise<OfficeInvoice> {
  return staffFetch<OfficeInvoice>(session, "/api/invoices", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function createEstimateInvoice(session: StoredStaffSession, estimateId: string): Promise<OfficeInvoice> {
  return staffFetch<OfficeInvoice>(session, `/api/estimates/${estimateId}/invoice`, {
    method: "POST",
  });
}

export function patchInvoiceStatus(
  session: StoredStaffSession,
  invoiceId: string,
  status: "sent" | "void",
): Promise<{ ok: boolean; status: string }> {
  return staffFetch<{ ok: boolean; status: string }>(session, `/api/invoices/${invoiceId}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function recordInvoicePayment(
  session: StoredStaffSession,
  invoiceId: string,
  body: { amount: number; method?: string },
): Promise<{ status: string; remaining: number; overpaid: number }> {
  return staffFetch<{ status: string; remaining: number; overpaid: number }>(
    session,
    `/api/invoices/${invoiceId}/pay`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
}

// ── Service plans & agreements ──

export function listServicePlans(session: StoredStaffSession): Promise<ServicePlanDTO[]> {
  return staffFetch<ServicePlanDTO[]>(session, "/api/service-plans");
}

export function listServiceAgreements(session: StoredStaffSession): Promise<ServiceAgreementDTO[]> {
  return staffFetch<ServiceAgreementDTO[]>(session, "/api/service-agreements");
}

// ── Reports (owner dashboard) ──

export function reportSummary(session: StoredStaffSession): Promise<ReportSummaryDTO> {
  return staffFetch<ReportSummaryDTO>(session, "/api/reports/summary");
}

export function reportArAging(session: StoredStaffSession): Promise<ArAgingReport> {
  return staffFetch<ArAgingReport>(session, "/api/reports/ar-aging");
}

export function reportEstimateConversion(session: StoredStaffSession, days?: number): Promise<EstimateConversionReport> {
  const params = days ? `?days=${days}` : "";
  return staffFetch<EstimateConversionReport>(session, `/api/reports/estimate-conversion${params}`);
}

export function reportRevenueTrend(session: StoredStaffSession, months?: number): Promise<RevenueTrendReport> {
  const params = months ? `?months=${months}` : "";
  return staffFetch<RevenueTrendReport>(session, `/api/reports/revenue-trend${params}`);
}

export function reportTechnicianScorecards(session: StoredStaffSession, days?: number): Promise<TechnicianScorecardsReport> {
  const params = days ? `?days=${days}` : "";
  return staffFetch<TechnicianScorecardsReport>(session, `/api/reports/technician-scorecards${params}`);
}

// ── Finance ──

export function financeDashboard(session: StoredStaffSession): Promise<FinanceDashboardDTO> {
  return staffFetch<FinanceDashboardDTO>(session, "/api/finance/dashboard");
}

export function listPettyCash(session: StoredStaffSession): Promise<PettyCashFundDTO[]> {
  return staffFetch<PettyCashFundDTO[]>(session, "/api/finance/petty-cash");
}

export function listExpenses(session: StoredStaffSession): Promise<ExpenseDTO[]> {
  return staffFetch<ExpenseDTO[]>(session, "/api/finance/expenses");
}

export function createExpense(
  session: StoredStaffSession,
  body: {
    title: string;
    amountCents: number;
    momoFeeCents?: number;
    paymentMethod?: FinancePaymentMethod;
    jobId?: string | null;
    submitImmediately?: boolean;
  },
): Promise<ExpenseDTO> {
  return staffFetch<ExpenseDTO>(session, "/api/finance/expenses", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function expenseAction(
  session: StoredStaffSession,
  id: string,
  action: "submit" | "review" | "approve" | "reject" | "pay" | "void",
  body?: Record<string, unknown>,
): Promise<ExpenseDTO> {
  return staffFetch<ExpenseDTO>(session, `/api/finance/expenses/${id}/${action}`, {
    method: "POST",
    body: JSON.stringify(body ?? {}),
  });
}

export function listBills(session: StoredStaffSession): Promise<SupplierBillDTO[]> {
  return staffFetch<SupplierBillDTO[]>(session, "/api/finance/bills");
}

export function createBill(
  session: StoredStaffSession,
  body: {
    supplierName: string;
    supplierReference?: string;
    issueDate: string;
    dueDate?: string;
    notes?: string;
    status?: "DRAFT" | "RECEIVED";
    lines: Array<{ description: string; quantity: number; unitPriceCents: number }>;
  },
): Promise<SupplierBillDTO> {
  return staffFetch<SupplierBillDTO>(session, "/api/finance/bills", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function recordBillPayment(
  session: StoredStaffSession,
  billId: string,
  body: { amountCents: number; method?: FinancePaymentMethod; reference?: string | null; paidAt?: string },
): Promise<SupplierBillDTO> {
  return staffFetch<SupplierBillDTO>(session, `/api/finance/bills/${billId}/payments`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function billAction(
  session: StoredStaffSession,
  id: string,
  action: "approve" | "dispute" | "void",
  body?: Record<string, unknown>,
): Promise<SupplierBillDTO> {
  return staffFetch<SupplierBillDTO>(session, `/api/finance/bills/${id}/${action}`, {
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

export function advanceAction(
  session: StoredStaffSession,
  id: string,
  action: "approve" | "disburse" | "cancel" | "settle",
  body?: Record<string, unknown>,
): Promise<CashAdvanceDTO> {
  return staffFetch<CashAdvanceDTO>(session, `/api/finance/advances/${id}/${action}`, {
    method: "POST",
    body: JSON.stringify(body ?? {}),
  });
}

export function listReimbursements(session: StoredStaffSession): Promise<ReimbursementDTO[]> {
  return staffFetch<ReimbursementDTO[]>(session, "/api/finance/reimbursements");
}

export function reimbursementAction(
  session: StoredStaffSession,
  id: string,
  action: "approve" | "pay" | "reject",
  body?: Record<string, unknown>,
): Promise<ReimbursementDTO> {
  return staffFetch<ReimbursementDTO>(session, `/api/finance/reimbursements/${id}/${action}`, {
    method: "POST",
    body: JSON.stringify(body ?? {}),
  });
}

export { FINANCE_PAYMENT_METHODS } from "@nnact/shared";
export type { FinancePaymentMethod };