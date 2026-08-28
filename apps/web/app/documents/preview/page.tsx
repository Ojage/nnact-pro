import Link from "next/link";
import { api } from "@/lib/api";
import { estimateDocumentHtml, invoiceDocumentHtml } from "@/lib/document-data";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DocumentPreviewWorkbench } from "@/components/document-preview-workbench";

export default async function DocumentPreviewPage() {
  const org = await api.org().catch(() => null);

  const invoiceHtml = invoiceDocumentHtml({
    invoice: {
      number: "INV-DEMO-1001",
      status: "sent",
      total: 185000,
      dueAt: new Date(Date.now() + 14 * 86400000).toISOString(),
      createdAt: new Date().toISOString(),
      payments: [],
    },
    customer: { name: "Demo Customer", email: "customer@example.com", phone: "(555) 010-1234" },
    job: { title: "Seasonal HVAC tune-up", description: "Sample customer-facing document using your saved invoice settings." },
    lineItems: [
      { description: "Diagnostic and tune-up", quantity: 1, unitPrice: 129000 },
      { description: "Filter replacement", quantity: 2, unitPrice: 28000 },
    ],
    org,
  });

  const estimateHtml = estimateDocumentHtml({
    estimate: {
      id: "preview-estimate",
      number: "EST-DEMO-2001",
      accepted: false,
      status: "sent",
      total: 245000,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 21 * 86400000).toISOString(),
      options: [
        {
          id: "good",
          label: org?.businessSettings?.estimate?.optionLabels?.[0] ?? "Good",
          lineItems: [{ description: "Basic repair", quantity: 1, unitPrice: 185000 }],
        },
        {
          id: "better",
          label: org?.businessSettings?.estimate?.optionLabels?.[1] ?? "Better",
          lineItems: [{ description: "Repair + maintenance plan", quantity: 1, unitPrice: 245000 }],
        },
      ],
      selectedOptionId: "better",
    },
    customer: { name: "Demo Customer", email: "customer@example.com", phone: "(555) 010-1234" },
    job: { title: "Refrigerator cooling repair", description: "Sample estimate using your saved estimate settings." },
    lineItems: [{ description: "Basic repair", quantity: 1, unitPrice: 185000 }],
    org,
  });

  return (
    <div>
      <PageHeader
        title="Document template preview"
        description="Invoice and estimate samples using the same renderer as previews, PDF downloads, and email attachments."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/documents">
              <Button size="sm" variant="secondary">Back to documents</Button>
            </Link>
            <Link href="/settings">
              <Button size="sm" variant="secondary">Edit branding</Button>
            </Link>
          </div>
        }
      />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Renderer samples</CardTitle>
          <CardDescription>
            Matches Settings previews and customer PDFs after you regenerate stored documents from the Documents hub.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DocumentPreviewWorkbench
            documents={[
              { id: "invoice", label: "Invoice sample", html: invoiceHtml },
              { id: "estimate", label: "Estimate sample", html: estimateHtml },
            ]}
            fileName="document-sample.html"
          />
        </CardContent>
      </Card>
    </div>
  );
}
