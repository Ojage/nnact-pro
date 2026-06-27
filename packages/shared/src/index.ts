// Shared domain enums + DTO types used by api, web, and mobile.

export const JOB_STATUS = [
  "lead",
  "scheduled",
  "in_progress",
  "completed",
  "canceled",
] as const;
export type JobStatus = (typeof JOB_STATUS)[number];

export const INVOICE_STATUS = ["draft", "sent", "paid", "void"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUS)[number];

export type Money = number; // cents, integer

/** Render integer cents as a dollar string. Canonical formatter for web/mobile. */
export function formatMoney(cents: Money): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export interface CustomerDTO {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  createdAt: string;
}

export interface JobDTO {
  id: string;
  customerId: string;
  title: string;
  status: JobStatus;
  scheduledAt?: string | null;
  total: Money;
  createdAt: string;
}
