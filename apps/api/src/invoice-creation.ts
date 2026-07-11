export interface ExistingInvoiceSummary {
  id: string;
  number: string;
  status: string;
}

export type InvoiceCreationBlock =
  | {
      statusCode: 400;
      body: {
        error: "job has no billable total";
        hint: "Add at least one billable line item before creating an invoice.";
      };
    }
  | {
      statusCode: 409;
      body: {
        error: "job already has an active invoice";
        invoice: ExistingInvoiceSummary;
      };
    };

export function validateInvoiceCreation(
  jobTotal: number,
  existingInvoice?: ExistingInvoiceSummary,
): InvoiceCreationBlock | null {
  if (jobTotal <= 0) {
    return {
      statusCode: 400,
      body: {
        error: "job has no billable total",
        hint: "Add at least one billable line item before creating an invoice.",
      },
    };
  }

  if (existingInvoice) {
    return {
      statusCode: 409,
      body: {
        error: "job already has an active invoice",
        invoice: existingInvoice,
      },
    };
  }

  return null;
}
