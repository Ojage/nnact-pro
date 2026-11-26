import { z } from "zod";

export const dueInvoiceSchema = z.object({
  invoiceId: z.string().uuid(),
  jobId: z.string().uuid().nullable(),
  number: z.string(),
  totalCents: z.number().int(),
  balanceCents: z.number().int(),
  dueAt: z.string(),
  daysOverdue: z.number().int(),
  customerId: z.string().uuid().nullable(),
  customerName: z.string(),
});

export const paymentReminderWriteSchema = z.object({
  invoiceId: z.string().uuid(),
  runId: z.string().uuid().optional(),
  dueAt: z.string(),
  balanceCents: z.number().int().positive(),
});

export const paymentReminderDTOSchema = z.object({
  id: z.string().uuid(),
  invoiceId: z.string().uuid(),
  status: z.string(),
  daysOverdue: z.number().int(),
  balanceCents: z.number().int(),
  toPhone: z.string().nullable(),
  sentAt: z.string().nullable(),
  createdAt: z.string(),
});

export type DueInvoice = z.infer<typeof dueInvoiceSchema>;
export type PaymentReminderWrite = z.infer<typeof paymentReminderWriteSchema>;
export type PaymentReminderDTO = z.infer<typeof paymentReminderDTOSchema>;
