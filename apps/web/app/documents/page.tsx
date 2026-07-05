import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const documentTypes = [
  {
    title: "Invoices",
    description: "Customer-facing invoices and receipts rendered from real line items and payments.",
    href: "/invoices",
  },
  {
    title: "Estimates",
    description: "Customer-facing estimate previews rendered from job totals and line items.",
    href: "/estimates",
  },
  {
    title: "Template preview",
    description: "Standalone demo of the shared Field Command document renderer.",
    href: "/documents/preview",
  },
];

export default function DocumentsPage() {
  return (
    <div>
      <PageHeader
        title="Documents"
        description="Brandable invoice, estimate, receipt, work-order, and service-plan document foundations."
      />

      <Card className="mb-6 border-accent/30 bg-accent/5">
        <p className="text-sm text-fg-muted">
          The current implementation renders HTML documents that can be printed or saved as PDF. The next production layer is server-side PDF generation and email delivery using the same shared renderer.
        </p>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {documentTypes.map((item) => (
          <Card key={item.title} className="flex flex-col justify-between gap-5">
            <div>
              <h2 className="text-lg font-semibold text-fg">{item.title}</h2>
              <p className="mt-2 text-sm text-fg-muted">{item.description}</p>
            </div>
            <Link href={item.href}>
              <Button size="sm" variant="secondary">Open</Button>
            </Link>
          </Card>
        ))}
      </div>

      <Card className="mt-6">
        <h2 className="text-base font-semibold text-fg">Direct HTML export routes</h2>
        <div className="mt-3 grid gap-2 text-sm text-fg-muted">
          <code>/invoices/[invoiceId]/document.html</code>
          <code>/estimates/[estimateId]/document.html</code>
        </div>
      </Card>
    </div>
  );
}
