import Link from "next/link";
import { api } from "@/lib/api";
import { invoiceDocumentHtml } from "@/lib/document-data";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { DocumentActions } from "@/app/documents/document-actions";

export default async function InvoicePreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [invoice, jobs, customers] = await Promise.all([
    api.invoice(id).catch(() => null),
    api.jobs().catch(() => []),
    api.customers().catch(() => []),
  ]);

  if (!invoice) {
    return (
      <div>
        <PageHeader title="Invoice preview unavailable" description={`Invoice ID: ${id}`} />
        <Card>
          <EmptyState title="No invoice data" description="Verify the invoice ID or check your API connection." />
        </Card>
      </div>
    );
  }

  const job = jobs.find((row) => row.id === invoice.jobId) ?? null;
  const customer = job ? customers.find((row) => row.id === job.customerId) ?? null : null;
  const html = invoiceDocumentHtml({ invoice, customer, job, lineItems: invoice.lineItems });

  return (
    <div>
      <PageHeader
        title={`Preview ${invoice.number}`}
        description="Customer-facing invoice/receipt document preview."
        actions={
          <div className="flex flex-wrap gap-2">
            <DocumentActions html={html} fileName={`${invoice.number}.html`} />
            <Link href={`/invoices/${invoice.id}`}>
              <Button size="sm" variant="secondary">Back to invoice</Button>
            </Link>
          </div>
        }
      />
      <Card className="mb-5 border-accent/30 bg-accent/5">
        <p className="text-sm text-fg-muted">
          This uses the shared document renderer with real invoice, payment, job, customer, and line-item data. Use Print / Save as PDF for now; a server-side PDF/email pipeline can plug into the same renderer.
        </p>
      </Card>
      <iframe
        title={`Invoice preview ${invoice.number}`}
        srcDoc={html}
        className="h-[980px] w-full rounded-2xl border border-border bg-white"
      />
    </div>
  );
}
