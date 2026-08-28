import Link from "next/link";
import { renderFieldDocumentHtml } from "@nnact/shared";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DocumentPreviewWorkbench } from "@/components/document-preview-workbench";

export default async function DocumentPreviewPage() {
  const org = await api.org().catch(() => null);

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
    notes: "Thank you for choosing our team. This sample uses your organization branding when settings are available.",
    lineItems: [
      { description: "Diagnostic and tune-up", quantity: 1, unitPriceCents: 129000 },
      { description: "Filter replacement", quantity: 2, unitPriceCents: 24000 },
    ],
    paymentsCents: 0,
    branding: {
      companyName: org?.name ?? "NNACT",
      logoUrl: org?.logoUrl ?? undefined,
      brandColor: org?.brandColor ?? "#22C55E",
      footerText: org?.documentFooter ?? "Field service command center document preview",
      publicEmail: org?.publicEmail,
      publicPhone: org?.publicPhone,
      publicAddress: org?.publicAddress,
      removeOpenFieldProAttribution: org?.removeOpenFieldProAttribution ?? false,
    },
    currency: org?.businessSettings?.currency,
  });

  return (
    <div>
      <PageHeader
        title="Document template preview"
        description="Standalone sample of the shared customer document renderer."
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
          <CardTitle>Renderer sample</CardTitle>
          <CardDescription>
            Uses the same HTML renderer as invoice and estimate previews. Download or print from the workbench controls.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DocumentPreviewWorkbench documents={[{ id: "invoice", label: "Invoice sample", html }]} fileName="document-sample.html" />
        </CardContent>
      </Card>
    </div>
  );
}
