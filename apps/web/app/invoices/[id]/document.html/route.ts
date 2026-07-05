import { api } from "@/lib/api";
import { invoiceDocumentHtml } from "@/lib/document-data";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const [invoice, jobs, customers] = await Promise.all([
    api.invoice(id).catch(() => null),
    api.jobs().catch(() => []),
    api.customers().catch(() => []),
  ]);

  if (!invoice) {
    return Response.json({ error: "invoice not found" }, { status: 404 });
  }

  const job = jobs.find((row) => row.id === invoice.jobId) ?? null;
  const customer = job ? customers.find((row) => row.id === job.customerId) ?? null : null;
  const html = invoiceDocumentHtml({ invoice, customer, job, lineItems: invoice.lineItems });

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-disposition": `inline; filename="${invoice.number}.html"`,
    },
  });
}
