import { eq, sql } from "drizzle-orm";
import { invoices, invoiceLineItems } from "@nnact/db";
import { depositAmountFor } from "./estimates.js";
import { defaultInvoiceDueAt, invoiceNumber } from "./invoicing.js";

/**
 * Creates the deposit invoice for an approved estimate option. Shared by staff
 * and customer portal approval flows.
 */
export async function createDepositInvoiceTx(
  tx: Parameters<Parameters<typeof import("@nnact/db").db.transaction>[0]>[0],
  input: {
    orgId: string;
    estimateId: string;
    estimateNumberValue: string;
    jobId: string;
    optionTotal: number;
    depositMode: "none" | "fixed" | "percent";
    depositValue: number;
    netDays: number;
    invoicePrefix: string;
    invoiceNextNumber: number;
    existingDepositInvoiceId: string | null;
  },
) {
  const deposit = depositAmountFor(input.optionTotal, input.depositMode, input.depositValue);
  if (deposit <= 0) return { deposit, invoiceId: null as string | null };
  if (input.existingDepositInvoiceId) return { deposit, invoiceId: input.existingDepositInvoiceId };

  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`invoice-number:${input.orgId}`}))`);
  const [{ count }] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(invoices)
    .where(eq(invoices.orgId, input.orgId));
  const [row] = await tx
    .insert(invoices)
    .values({
      orgId: input.orgId,
      jobId: input.jobId,
      number: invoiceNumber(count, input.invoicePrefix, input.invoiceNextNumber),
      status: "sent",
      total: deposit,
      dueAt: defaultInvoiceDueAt(input.netDays),
    })
    .returning();
  await tx.insert(invoiceLineItems).values({
    orgId: input.orgId,
    invoiceId: row.id,
    description: `Deposit for ${input.estimateNumberValue}`,
    quantity: 1,
    unitPrice: deposit,
    unitCost: 0,
    position: 0,
  });
  return { deposit, invoiceId: row.id };
}
