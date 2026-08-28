"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatMoney } from "@nnact/shared";
import { api, type DocumentHubEntryDTO } from "@/lib/api";
import { estimateDocumentHtml, invoiceDocumentHtml } from "@/lib/document-data";
import { useDocumentsHubQuery, useOrgQuery } from "@/lib/redux/api";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormSelect } from "@/components/ui/form-select";
import { InfoTip } from "@/components/ui/info-tip";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { InvoiceStatusBadge } from "@/components/status-badge";
import { MessageSendDialog } from "@/components/message-send-dialog";
import { DocumentPreviewWorkbench } from "@/components/document-preview-workbench";

type KindFilter = "all" | "invoice" | "estimate";
type PdfFilter = "all" | "stored" | "missing";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatWhen(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

function estimateStatusBadge(status: string) {
  const tone =
    status === "approved" || status === "accepted"
      ? "bg-green/10 text-green"
      : status === "declined" || status === "void"
        ? "bg-red/10 text-red"
        : status === "sent"
          ? "bg-blue/10 text-blue"
          : "bg-surface-300 text-fg-muted";
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${tone}`}>
      {status.replaceAll("_", " ")}
    </span>
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function DocumentsHub() {
  const { data: entries = [], isLoading, isError, refetch } = useDocumentsHubQuery();
  const { data: org } = useOrgQuery();

  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [pdfFilter, setPdfFilter] = useState<PdfFilter>("all");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [emailTarget, setEmailTarget] = useState<{ kind: "invoice" | "estimate"; documentId: string; title: string } | null>(null);

  const stats = useMemo(() => {
    const invoices = entries.filter((entry) => entry.kind === "invoice").length;
    const estimates = entries.filter((entry) => entry.kind === "estimate").length;
    const stored = entries.filter((entry) => entry.stored).length;
    const emailsSent = entries.reduce((sum, entry) => sum + entry.emailsSent, 0);
    return { invoices, estimates, stored, emailsSent };
  }, [entries]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((entry) => {
      if (kindFilter !== "all" && entry.kind !== kindFilter) return false;
      if (pdfFilter === "stored" && !entry.stored) return false;
      if (pdfFilter === "missing" && entry.stored) return false;
      if (!q) return true;
      return (
        entry.number.toLowerCase().includes(q) ||
        (entry.customerName?.toLowerCase().includes(q) ?? false) ||
        (entry.jobTitle?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [entries, search, kindFilter, pdfFilter]);

  const recentDeliveries = useMemo(
    () =>
      entries
        .filter((entry) => entry.lastEmailAt)
        .sort((a, b) => new Date(b.lastEmailAt!).getTime() - new Date(a.lastEmailAt!).getTime())
        .slice(0, 6),
    [entries],
  );

  const brandingPreview = useMemo(() => {
    if (!org) return null;
    const invoiceHtml = invoiceDocumentHtml({
      invoice: {
        number: "INV-PREVIEW-1001",
        status: "sent",
        total: 185000,
        dueAt: new Date(Date.now() + 14 * 86400000).toISOString(),
        createdAt: new Date().toISOString(),
        payments: [],
      },
      customer: { name: "Taylor Morgan", email: "taylor@example.test", phone: "(555) 010-1234" },
      job: { title: "Seasonal HVAC tune-up", description: "Sample customer-facing document using your current branding." },
      lineItems: [
        { description: "Diagnostic and tune-up", quantity: 1, unitPrice: 129000 },
        { description: "Filter replacement", quantity: 2, unitPrice: 28000 },
      ],
      org,
    });
    const estimateHtml = estimateDocumentHtml({
      estimate: {
        id: "preview-estimate",
        number: "EST-PREVIEW-2001",
        accepted: false,
        status: "sent",
        total: 245000,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 21 * 86400000).toISOString(),
        options: [
          {
            id: "good",
            label: "Good",
            lineItems: [{ description: "Basic repair", quantity: 1, unitPrice: 185000 }],
          },
          {
            id: "better",
            label: "Better",
            lineItems: [{ description: "Repair + maintenance plan", quantity: 1, unitPrice: 245000 }],
          },
        ],
        selectedOptionId: "better",
      },
      customer: { name: "Taylor Morgan", email: "taylor@example.test", phone: "(555) 010-1234" },
      job: { title: "Refrigerator cooling repair", description: "Choose the repair scope that fits the customer's needs." },
      lineItems: [{ description: "Basic repair", quantity: 1, unitPrice: 185000 }],
      org,
    });
    return [
      { id: "invoice", label: "Invoice", html: invoiceHtml },
      { id: "estimate", label: "Estimate", html: estimateHtml },
    ];
  }, [org]);

  async function downloadPdf(entry: DocumentHubEntryDTO) {
    const key = `${entry.kind}:${entry.documentId}`;
    setBusyKey(key);
    setActionError(null);
    try {
      const result =
        entry.kind === "invoice"
          ? await api.invoicePdf(entry.documentId)
          : await api.estimatePdf(entry.documentId);
      downloadBlob(result.blob, result.filename);
      void refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to download the PDF");
    } finally {
      setBusyKey(null);
    }
  }

  async function regeneratePdf(entry: DocumentHubEntryDTO) {
    const key = `${entry.kind}:${entry.documentId}:regen`;
    setBusyKey(key);
    setActionError(null);
    try {
      if (entry.kind === "invoice") {
        await api.regenerateInvoiceDocument(entry.documentId);
      } else {
        await api.regenerateEstimateDocument(entry.documentId);
      }
      void refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to regenerate the PDF");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Documents"
        description="Branded invoices, estimates, and receipts — preview, store PDFs, and email customers from one place."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/documents/preview">
              <Button size="sm" variant="ghost">Template sample</Button>
            </Link>
            <Link href="/settings">
              <Button size="sm" variant="secondary">Branding settings</Button>
            </Link>
          </div>
        }
      />

      {actionError ? (
        <Card className="mb-6 border-red/30 bg-red/5">
          <CardContent className="py-4 text-sm text-red">{actionError}</CardContent>
        </Card>
      ) : null}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Invoices", value: stats.invoices, hint: "Billable work orders" },
          { label: "Estimates", value: stats.estimates, hint: "Customer proposals" },
          { label: "Stored PDFs", value: stats.stored, hint: "Immutable snapshots on disk" },
          { label: "Emails delivered", value: stats.emailsSent, hint: "Successful customer sends" },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="pb-2">
              <CardDescription>{stat.label}</CardDescription>
              <CardTitle className="text-3xl font-black tabular-nums">{isLoading ? "—" : stat.value}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-xs text-fg-muted">{stat.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-[1.05fr_.95fr]">
        <Card>
          <CardHeader>
            <CardTitle className="inline-flex items-center gap-1.5">
              Branding preview
              <InfoTip label="About branding preview" side="right">
                Live sample of how invoices and estimates look with your company name, colors, logo, and footer from Settings.
              </InfoTip>
            </CardTitle>
            <CardDescription>Customer-facing layout before you send or download a real document.</CardDescription>
          </CardHeader>
          <CardContent>
            {org && brandingPreview ? (
              <DocumentPreviewWorkbench documents={brandingPreview} compact fileName="branding-preview.html" />
            ) : (
              <Skeleton className="h-[420px] w-full rounded-xl" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="inline-flex items-center gap-1.5">
              Recent deliveries
              <InfoTip label="About recent deliveries" side="right">
                The latest email attempts for invoices and estimates, including successful sends and failures you can retry from the document row.
              </InfoTip>
            </CardTitle>
            <CardDescription>Last customer email activity across your document library.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-16 w-full rounded-xl" />
                <Skeleton className="h-16 w-full rounded-xl" />
              </div>
            ) : recentDeliveries.length === 0 ? (
              <EmptyState
                title="No emails sent yet"
                description="Send an invoice or estimate from the library below. Each send attaches the stored PDF automatically."
              />
            ) : (
              <div className="space-y-3">
                {recentDeliveries.map((entry) => (
                  <div key={`${entry.kind}:${entry.documentId}`} className="rounded-xl border border-border bg-surface-100 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-fg">
                          {entry.kind === "invoice" ? "Invoice" : "Estimate"} {entry.number}
                        </p>
                        <p className="mt-1 text-xs text-fg-muted">{entry.customerName ?? "Unknown customer"}</p>
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
                          entry.lastEmailStatus === "sent"
                            ? "bg-green/10 text-green"
                            : entry.lastEmailStatus === "failed"
                              ? "bg-red/10 text-red"
                              : "bg-yellow/10 text-yellow"
                        }`}
                      >
                        {entry.lastEmailStatus ?? "pending"}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-fg-dim">{formatWhen(entry.lastEmailAt)}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="inline-flex items-center gap-1.5">
            Document library
            <InfoTip label="About document library" side="right">
              Every invoice and estimate in your organization. Preview the HTML customer view, download or regenerate the stored PDF, or email the customer with the PDF attached.
            </InfoTip>
          </CardTitle>
          <CardDescription>Search, filter, and act on customer-facing documents.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <div className="flex-1">
              <label className="mb-1.5 block text-xs font-semibold text-fg-muted">Search</label>
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by number, customer, or job…"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:w-[420px]">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-fg-muted">Type</label>
                <FormSelect
                  value={kindFilter}
                  onChange={(value) => setKindFilter(value as KindFilter)}
                  options={[
                    { value: "all", label: "All types" },
                    { value: "invoice", label: "Invoices" },
                    { value: "estimate", label: "Estimates" },
                  ]}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-fg-muted">PDF snapshot</label>
                <FormSelect
                  value={pdfFilter}
                  onChange={(value) => setPdfFilter(value as PdfFilter)}
                  options={[
                    { value: "all", label: "All" },
                    { value: "stored", label: "Stored only" },
                    { value: "missing", label: "Not generated yet" },
                  ]}
                />
              </div>
            </div>
          </div>

          {isLoading ? (
            <Skeleton className="h-72 w-full rounded-xl" />
          ) : isError ? (
            <EmptyState title="Unable to load documents" description="Check your API connection and try again." />
          ) : filtered.length === 0 ? (
            <EmptyState
              title={entries.length === 0 ? "No documents yet" : "No matches"}
              description={
                entries.length === 0
                  ? "Create an estimate or invoice from a job to see customer-facing documents here."
                  : "Try a different search or filter."
              }
            />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Document</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>PDF</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((entry) => {
                    const rowKey = `${entry.kind}:${entry.documentId}`;
                    const previewHref =
                      entry.kind === "invoice"
                        ? `/invoices/${entry.documentId}/preview`
                        : `/estimates/${entry.documentId}/preview`;
                    const sourceHref =
                      entry.kind === "invoice" ? `/invoices/${entry.documentId}` : `/estimates/${entry.documentId}`;

                    return (
                      <TableRow key={rowKey}>
                        <TableCell>
                          <div className="min-w-[160px]">
                            <p className="font-semibold text-fg">
                              {entry.kind === "invoice" ? "Invoice" : "Estimate"} {entry.number}
                            </p>
                            <p className="mt-1 text-xs text-fg-muted">{entry.jobTitle ?? "Untitled job"}</p>
                            <p className="mt-1 text-[11px] text-fg-dim">Created {formatWhen(entry.createdAt)}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          {entry.customerId ? (
                            <Link href={`/customers/${entry.customerId}`} className="text-sm text-fg-link hover:text-fg">
                              {entry.customerName ?? "Customer"}
                            </Link>
                          ) : (
                            <span className="text-sm text-fg-muted">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {entry.kind === "invoice" ? (
                            <InvoiceStatusBadge status={entry.status as "draft" | "sent" | "paid" | "void"} />
                          ) : (
                            estimateStatusBadge(entry.status)
                          )}
                        </TableCell>
                        <TableCell className="font-semibold tabular-nums">{formatMoney(entry.total)}</TableCell>
                        <TableCell>
                          {entry.stored ? (
                            <div className="text-xs text-fg-muted">
                              <p className="font-medium text-fg">Stored</p>
                              <p>{formatBytes(entry.stored.sizeBytes)}</p>
                              <p className="text-fg-dim">{formatWhen(entry.stored.createdAt)}</p>
                            </div>
                          ) : (
                            <span className="text-xs text-fg-muted">Generated on first download or send</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="text-xs text-fg-muted">
                            <p>{entry.emailsSent > 0 ? `${entry.emailsSent} delivered` : "Not sent"}</p>
                            {entry.lastEmailAt ? <p className="text-fg-dim">{formatWhen(entry.lastEmailAt)}</p> : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap justify-end gap-2">
                            <Link href={previewHref}>
                              <Button size="sm" variant="secondary">Preview</Button>
                            </Link>
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={busyKey === rowKey}
                              onClick={() => void downloadPdf(entry)}
                            >
                              {busyKey === rowKey ? "Working…" : "PDF"}
                            </Button>
                            <Button size="sm" variant="secondary" onClick={() => setEmailTarget({
                              kind: entry.kind,
                              documentId: entry.documentId,
                              title: `Email ${entry.kind} ${entry.number}`,
                            })}
                            >
                              Email
                            </Button>
                            {entry.stored ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={busyKey === `${rowKey}:regen`}
                                onClick={() => void regeneratePdf(entry)}
                              >
                                Regenerate
                              </Button>
                            ) : null}
                            <Link href={sourceHref}>
                              <Button size="sm" variant="ghost">Open</Button>
                            </Link>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {emailTarget ? (
        <MessageSendDialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setEmailTarget(null);
              void refetch();
            }
          }}
          kind={emailTarget.kind}
          documentId={emailTarget.documentId}
          title={emailTarget.title}
          description="The stored PDF is attached automatically when delivery succeeds."
        />
      ) : null}
    </div>
  );
}
