"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Banknote, Download, ExternalLink, Eye, FilePlus2, FileText, RefreshCw, TriangleAlert, Wallet } from "lucide-react";
import { PrefetchLink as Link } from "@/components/prefetch-link";
import { formatMoney } from "@nnact/shared";
import type { JobDTO } from "@nnact/shared";
import type { Invoice as InvoiceDTO } from "@/lib/api";
import { usePrefetchListDetails } from "@/hooks/use-prefetch-list-details";
import { explainRtkError, useCreateInvoiceMutation, useCustomersQuery, useInvoicesQuery, useJobsQuery, useOrgQuery } from "@/lib/redux/api";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FormSelect } from "@/components/ui/form-select";
import { Label } from "@/components/ui/label";
import { InfoTip } from "@/components/ui/info-tip";
import { InvoiceStatusBadge } from "@/components/status-badge";
import {
  Banner,
  ConsoleHeader,
  ConsolePage,
  ResourceTable,
  SummaryCards,
  ToolbarButton,
  downloadCsv,
  primaryButton,
  resourceLink,
  type Column,
  type Facet,
} from "@/components/console";

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "paid", label: "Paid" },
  { value: "void", label: "Void" },
];

function isOverdue(invoice: InvoiceDTO, now: number): boolean {
  return invoice.status === "sent" && !!invoice.dueAt && new Date(invoice.dueAt).getTime() < now;
}

export default function InvoicesPage() {
  const router = useRouter();
  const invoicesQuery = useInvoicesQuery();
  const { data: invoices = [], isLoading: loading, isError } = invoicesQuery;
  const { data: jobs = [] } = useJobsQuery();
  const { data: customers = [] } = useCustomersQuery();
  const { data: org } = useOrgQuery();
  const [createInvoice, { isLoading: createSubmitting }] = useCreateInvoiceMutation();
  const [visible, setVisible] = useState<InvoiceDTO[]>([]);
  const [facetValues, setFacetValues] = useState<Record<string, string[]>>({});

  // ── Create invoice modal ──
  const [showCreate, setShowCreate] = useState(false);
  const [createJobId, setCreateJobId] = useState("");
  const [createDueAt, setCreateDueAt] = useState("");
  const [createDiscountId, setCreateDiscountId] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const discounts = org?.businessSettings?.taxes?.discounts ?? [];
  const discountsEnabled = org?.businessSettings?.taxes?.discountsEnabled ?? true;

  // Jobs that don't already have an invoice
  const invoicedJobIds = useMemo(() => new Set(invoices.map((i) => i.jobId)), [invoices]);
  const uninvoicedJobs = useMemo(
    () => jobs.filter((j) => !invoicedJobIds.has(j.id) && j.status !== "canceled"),
    [jobs, invoicedJobIds],
  );

  const handleCreateInvoice = async () => {
    if (!createJobId) return;
    setCreateError(null);
    try {
      await createInvoice({
        jobId: createJobId,
        ...(createDueAt ? { dueAt: new Date(createDueAt).toISOString() } : {}),
        ...(createDiscountId ? { discountId: createDiscountId } : {}),
      }).unwrap();
      setShowCreate(false);
      setCreateJobId("");
      setCreateDueAt("");
      setCreateDiscountId("");
    } catch (e) {
      setCreateError(explainRtkError(e, "Could not create the invoice"));
    }
  };

  const openCreate = () => {
    setCreateJobId("");
    setCreateDueAt("");
    setCreateDiscountId("");
    setCreateError(null);
    setShowCreate(true);
  };

  // ── Lookups ──
  const jobMap = useMemo(() => new Map<string, JobDTO>(jobs.map((j) => [j.id, j])), [jobs]);
  const customerMap = useMemo(() => new Map<string, string>(customers.map((c) => [c.id, c.name])), [customers]);
  const customerOf = (invoice: InvoiceDTO) => {
    const job = jobMap.get(invoice.jobId);
    return job ? customerMap.get(job.customerId) ?? "" : "";
  };

  // ── Metrics ──
  const now = Date.now();
  const metrics = useMemo(() => {
    let outstanding = 0;
    let overdue = 0;
    let overdueCount = 0;
    let paid = 0;
    let drafts = 0;
    for (const invoice of invoices) {
      if (invoice.status === "sent" || invoice.status === "draft") outstanding += invoice.total;
      if (invoice.status === "paid") paid += invoice.total;
      if (invoice.status === "draft") drafts += 1;
      if (isOverdue(invoice, now)) {
        overdue += invoice.total;
        overdueCount += 1;
      }
    }
    return { outstanding, overdue, overdueCount, paid, drafts };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoices]);

  usePrefetchListDetails(
    "invoices",
    useMemo(() => visible.slice(0, 40).map((inv) => inv.id), [visible]),
  );
  const onFilteredChange = useCallback((rows: InvoiceDTO[]) => setVisible(rows), []);

  const exportRows = (rows: readonly InvoiceDTO[]) =>
    downloadCsv(`invoices-${new Date().toISOString().slice(0, 10)}.csv`, rows, [
      ["Number", (inv) => inv.number],
      ["Status", (inv) => inv.status],
      ["Customer", (inv) => customerOf(inv)],
      ["Job", (inv) => jobMap.get(inv.jobId)?.title ?? ""],
      ["Due", (inv) => inv.dueAt ?? ""],
      ["Total", (inv) => (inv.total / 100).toFixed(2)],
    ]);

  const columns: Column<InvoiceDTO>[] = [
    {
      id: "number",
      header: "Invoice",
      sortValue: (inv) => inv.number,
      cell: (inv) => (
        <Link href={`/invoices/${inv.id}`} className={`${resourceLink} font-mono`}>
          {inv.number}
        </Link>
      ),
    },
    {
      id: "status",
      header: "Status",
      sortValue: (inv) => inv.status,
      cell: (inv) => (
        <span className="inline-flex flex-wrap items-center gap-2">
          <InvoiceStatusBadge status={inv.status} />
          {isOverdue(inv, now) ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--console-danger-fg)]">
              <TriangleAlert className="size-3.5" aria-hidden="true" />
              Overdue
            </span>
          ) : null}
        </span>
      ),
    },
    {
      id: "customer",
      header: "Customer",
      sortValue: (inv) => customerOf(inv),
      cell: (inv) => {
        const job = jobMap.get(inv.jobId);
        return job ? (
          <Link href={`/customers/${job.customerId}`} className="text-fg hover:text-[var(--shell-accent-text)] hover:underline">
            {customerMap.get(job.customerId) ?? "—"}
          </Link>
        ) : (
          <span className="text-fg-muted">—</span>
        );
      },
    },
    {
      id: "job",
      header: "Job",
      hideBelow: "md",
      sortValue: (inv) => jobMap.get(inv.jobId)?.title ?? "",
      cell: (inv) => {
        const job = jobMap.get(inv.jobId);
        return job ? (
          <Link href={`/jobs/${job.id}`} className="block max-w-[18rem] truncate text-fg-muted hover:text-[var(--shell-accent-text)] hover:underline">
            {job.title}
          </Link>
        ) : (
          <span className="text-fg-muted">—</span>
        );
      },
    },
    {
      id: "due",
      header: "Due",
      hideBelow: "sm",
      sortValue: (inv) => inv.dueAt ?? "",
      cell: (inv) => <span className="whitespace-nowrap text-fg-muted">{inv.dueAt ? new Date(inv.dueAt).toLocaleDateString() : "No due date"}</span>,
    },
    {
      id: "total",
      header: "Total",
      align: "right",
      sortValue: (inv) => inv.total,
      cell: (inv) => <span className="whitespace-nowrap font-mono text-fg">{formatMoney(inv.total)}</span>,
    },
  ];

  const facets: Facet<InvoiceDTO>[] = [{ id: "status", label: "Status", options: STATUS_OPTIONS, value: (inv) => inv.status }];

  // ── Loading ──
  if (loading) {
    return (
      <div className="grid gap-4" aria-busy="true" aria-label="Loading invoices">
        <Skeleton className="h-8 w-40 rounded-[6px]" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-24 rounded-[8px]" />
          ))}
        </div>
        <Skeleton className="h-80 rounded-[8px]" />
      </div>
    );
  }

  return (
    <ConsolePage>
      <ConsoleHeader
        title="Invoices"
        toolbar={
          <>
            <ToolbarButton icon={FilePlus2} onClick={openCreate} data-tour="invoices-add">
              Create Invoice
            </ToolbarButton>
            <ToolbarButton icon={Download} onClick={() => exportRows(visible.length ? visible : invoices)} disabled={invoices.length === 0}>
              Export CSV
            </ToolbarButton>
            <ToolbarButton icon={RefreshCw} spinning={invoicesQuery.isFetching} disabled={invoicesQuery.isFetching} onClick={() => void invoicesQuery.refetch()}>
              Refresh
            </ToolbarButton>
          </>
        }
      />

      {isError ? (
        <Banner tone="danger" title="Invoices could not be loaded.">
          Check your connection and try again.
        </Banner>
      ) : null}

      {metrics.overdueCount > 0 ? (
        <Banner
          tone="warning"
          title={`${metrics.overdueCount} invoice${metrics.overdueCount === 1 ? " is" : "s are"} past the due date`}
          action={
            <button
              type="button"
              className="text-sm font-medium text-[var(--shell-accent-text)] hover:underline"
              onClick={() => setFacetValues({ status: ["sent"] })}
            >
              Show sent invoices
            </button>
          }
        >
          {formatMoney(metrics.overdue)} is overdue. Send a reminder or record the payment from each invoice.
        </Banner>
      ) : null}

      {invoices.length > 0 ? (
        <SummaryCards
          label="Billing summary"
          items={[
            { label: "Outstanding", icon: Wallet, value: formatMoney(metrics.outstanding), note: "Draft and sent invoices" },
            {
              label: "Overdue",
              icon: TriangleAlert,
              value: formatMoney(metrics.overdue),
              note: metrics.overdueCount ? `${metrics.overdueCount} past due` : "Nothing overdue",
              attention: metrics.overdueCount > 0,
            },
            { label: "Collected", icon: Banknote, value: formatMoney(metrics.paid), note: "Invoices marked paid" },
            { label: "Drafts", icon: FileText, value: metrics.drafts, note: metrics.drafts ? "Not yet sent to customers" : "No drafts waiting" },
          ]}
        />
      ) : null}

      {/* ── Create Invoice modal ── */}
      {showCreate && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowCreate(false)}
            onKeyDown={(e) => { if (e.key === "Escape") setShowCreate(false); }}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <Card className="w-full max-w-md" data-tour="invoices-form">
              <form
                onSubmit={(e) => { e.preventDefault(); handleCreateInvoice(); }}
                className="p-6"
              >
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-medium text-fg">Create Invoice</h2>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-fg-muted hover:text-fg"
                    onClick={() => setShowCreate(false)}
                    aria-label="Close create invoice dialog"
                  >
                    ✕
                  </Button>
                </div>

                {createError && (
                  <p role="alert" className="mb-3 rounded-[6px] bg-[color-mix(in_srgb,var(--console-danger-fg)_8%,transparent)] p-2 text-sm text-[var(--console-danger-fg)]">{createError}</p>
                )}

                <div className="space-y-4">
                  <div>
                    <Label htmlFor="invoice-create-job" className="mb-1.5 block text-sm font-medium text-fg">Job *</Label>
                    <FormSelect
                      id="invoice-create-job"
                      value={createJobId}
                      onChange={setCreateJobId}
                      allowEmpty
                      placeholder="Select a job..."
                      emptyLabel="Select a job..."
                      options={uninvoicedJobs.map((j) => {
                        const cust = customerMap.get(j.customerId);
                        return {
                          value: j.id,
                          label: `${j.title}${cust ? ` — ${cust}` : ""} · ${formatMoney(j.total)}`,
                        };
                      })}
                    />
                    {uninvoicedJobs.length === 0 && (
                      <p className="text-xs text-fg-dim mt-1">All jobs already have invoices.</p>
                    )}
                  </div>

                  {discountsEnabled && discounts.length > 0 && (
                    <div>
                      <Label className="mb-1.5 block text-xs font-semibold text-fg-muted">
                        Discount
                        <InfoTip label="About discount" side="top">Applies a saved discount profile to the whole invoice. Discounts are subtracted before tax.</InfoTip>
                      </Label>
                      <FormSelect
                        value={createDiscountId}
                        onChange={setCreateDiscountId}
                        allowEmpty
                        placeholder="No discount"
                        emptyLabel="No discount"
                        options={discounts.map((discount) => ({
                          value: discount.id,
                          label: `${discount.name} · ${discount.type === "fixed" ? formatMoney(discount.value) : `${discount.value / 100}%`}`,
                        }))}
                      />
                    </div>
                  )}

                  <div>
                    <label htmlFor="invoice-create-due" className="mb-1.5 block text-sm font-medium text-fg">
                      Due date (optional)
                    </label>
                    <Input
                      id="invoice-create-due"
                      type="date"
                      value={createDueAt}
                      onChange={(e) => setCreateDueAt(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex gap-2 mt-6">
                  <Button
                    type="submit"
                    loading={createSubmitting}
                    disabled={!createJobId}
                  >
                    Create Invoice
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setShowCreate(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </Card>
          </div>
        </>
      )}

      <div data-tour="invoices-list" className="min-w-0">
        <ResourceTable
          caption="Invoices"
          rows={invoices}
          columns={columns}
          getRowId={(inv) => inv.id}
          rowLabel={(inv) => inv.number}
          searchText={(inv) => [inv.number, customerOf(inv), jobMap.get(inv.jobId)?.title, inv.status].filter(Boolean).join(" ")}
          filterPlaceholder="Search by invoice number, customer or job"
          facets={facets}
          facetValues={facetValues}
          onFacetValuesChange={setFacetValues}
          defaultSort={{ id: "number", dir: "desc" }}
          minWidth="42rem"
          selectable
          bulkActions={(selected) => (
            <ToolbarButton icon={Download} onClick={() => exportRows(selected)}>
              Export selected
            </ToolbarButton>
          )}
          onFilteredChange={onFilteredChange}
          rowMenu={(inv) => [
            { label: "View invoice", icon: ExternalLink, onSelect: () => router.push(`/invoices/${inv.id}`) },
            { label: "Preview document", icon: Eye, onSelect: () => router.push(`/invoices/${inv.id}/preview`) },
            "separator",
            { label: "Open job", icon: FileText, onSelect: () => router.push(`/jobs/${inv.jobId}`) },
          ]}
          empty={
            <div className="grid justify-items-center gap-2 px-6 py-12 text-center">
              <p className="text-base font-medium text-fg">No invoices yet</p>
              <p className="max-w-md text-sm text-fg-muted">Create an invoice from a finished job. Its line items and pricing carry over.</p>
              <button type="button" className={`${primaryButton} mt-2`} onClick={openCreate}>
                <FilePlus2 className="size-4" aria-hidden="true" />
                Create Invoice
              </button>
            </div>
          }
        />
      </div>
    </ConsolePage>
  );
}
