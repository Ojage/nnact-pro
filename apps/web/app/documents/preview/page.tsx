import { renderFieldDocumentHtml } from "@nnact/shared";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";

export default function DocumentPreviewPage() {
  const html = renderFieldDocumentHtml({
    kind: "invoice",
    number: "INV-DEMO-1001",
    status: "draft",
    issuedAt: new Date().toLocaleDateString(),
    dueAt: new Date(Date.now() + 14 * 86400000).toLocaleDateString(),
    customerName: "Demo Customer",
    customerEmail: "customer@example.com",
    customerPhone: "(555) 010-1234",
    jobTitle: "Seasonal HVAC tune-up",
    notes: "Thank you for choosing this service business. This is a preview template and not a final PDF renderer yet.",
    lineItems: [
      { description: "Diagnostic and tune-up", quantity: 1, unitPriceCents: 12900 },
      { description: "Filter replacement", quantity: 2, unitPriceCents: 2400 },
      { description: "Service plan discount", quantity: 1, unitPriceCents: -1500 },
    ],
    paymentsCents: 0,
    branding: {
      companyName: "NNACT",
      brandColor: "#22C55E",
      footerText: "Field service command center document preview",
      removeOpenFieldProAttribution: false,
    },
  });

  return (
    <div>
      <PageHeader
        title="Document Preview"
        description="Brandable invoice, estimate, receipt, work-order, and service-plan document rendering foundation."
      />
      <Card className="mb-5 border-accent/30 bg-accent/5">
        <p className="text-sm text-fg-muted">
          This is the HTML rendering foundation. The next step is wiring real invoice/estimate data into this renderer and exporting to PDF/email.
        </p>
      </Card>
      <iframe
        title="NNACT Pro document preview"
        srcDoc={html}
        className="h-[900px] w-full rounded-2xl border border-border bg-white"
      />
    </div>
  );
}
