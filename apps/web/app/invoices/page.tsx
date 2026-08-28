"use client";

import { useEffect, useState, useMemo } from "react";
import { PrefetchLink as Link } from "@/components/prefetch-link";
import { formatMoney } from "@nnact/shared";
import type { JobDTO, CustomerDTO } from "@nnact/shared";
import { usePrefetchListDetails } from "@/hooks/use-prefetch-list-details";
import { useCreateInvoiceMutation, useCustomersQuery, useInvoicesQuery, useJobsQuery, useOrgQuery } from "@/lib/redux/api";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FormSelect } from "@/components/ui/form-select";
import { Label } from "@/components/ui/label";
import { InfoTip } from "@/components/ui/info-tip";
import { InvoiceStatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Pagination } from "@/components/pagination";

type SortField = "number" | "status" | "total";
type SortDir = "asc" | "desc";
type StatusFilter = "all" | "draft" | "sent" | "paid" | "void";

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "paid", label: "Paid" },
  { value: "void", label: "Void" },
];

export default function InvoicesPage() {
  const { data: invoices = [], isLoading: loading, isError, error: queryError } = useInvoicesQuery();
  const { data: jobs = [] } = useJobsQuery();
  const { data: customers = [] } = useCustomersQuery();
  const { data: org } = useOrgQuery();
  const [createInvoice, { isLoading: createSubmitting }] = useCreateInvoiceMutation();
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("number");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [skip, setSkip] = useState(0);
  const take = 50;

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
      setCreateError(String(e));
    }
  };

  const openCreate = () => {
    setCreateJobId("");
    setCreateDueAt("");
    setCreateDiscountId("");
    setCreateError(null);
    setShowCreate(true);
  };

  // Reset pagination when filters change
  useEffect(() => { setSkip(0); }, [search, statusFilter]);

  // ── Lookups ──
  const jobMap = useMemo(() => {
    const m = new Map<string, JobDTO>();
    for (const j of jobs) m.set(j.id, j);
    return m;
  }, [jobs]);

  const customerMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of customers) m.set(c.id, c.name);
    return m;
  }, [customers]);

  // ── Metrics ──
  const outstanding = useMemo(
    () =>
      invoices
        .filter((i) => i.status === "sent" || i.status === "draft")
        .reduce((a, i) => a + i.total, 0),
    [invoices],
  );

  // ── Filter + sort ──
  const filteredSorted = useMemo(() => {
    let list = [...invoices];

    // Status filter
    if (statusFilter !== "all") {
      list = list.filter((i) => i.status === statusFilter);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((inv) => {
        const job = jobMap.get(inv.jobId);
        const custName = job ? customerMap.get(job.customerId) : undefined;
        return (
          inv.number.toLowerCase().includes(q) ||
          (custName?.toLowerCase().includes(q) ?? false) ||
          (job?.title.toLowerCase().includes(q) ?? false)
        );
      });
    }

    list.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "number":
          cmp = a.number.localeCompare(b.number);
          break;
        case "status":
          cmp = a.status.localeCompare(b.status);
          break;
        case "total":
          cmp = a.total - b.total;
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return list;
  }, [invoices, search, sortField, sortDir, jobMap, customers, statusFilter]);

  const paginated = useMemo(() => filteredSorted.slice(skip, skip + take), [filteredSorted, skip, take]);

  usePrefetchListDetails(
    "invoices",
    useMemo(() => filteredSorted.slice(0, 40).map((inv) => inv.id), [filteredSorted]),
  );

  // ── Sort helpers ──
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const SortHead = ({ field, label }: { field: SortField; label: string }) => {
    const active = sortField === field;
    return (
      <TableHead
        className="cursor-pointer select-none hover:text-fg transition-colors"
        onClick={() => handleSort(field)}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          <span className="text-fg-dim text-[10px] w-3 text-center">
            {active ? (sortDir === "asc" ? "↑" : "↓") : " "}
          </span>
        </span>
      </TableHead>
    );
  };

  // ── Loading ──
  if (loading) {
    return (
      <div>
        <div className="flex items-end justify-between mb-8">
          <div>
            <Skeleton className="h-8 w-32 mb-2" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
        <Skeleton className="h-10 w-80 rounded-lg mb-4" />
        {/* Desktop skeleton */}
        <div className="hidden md:block rounded-xl border border-border overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-none border-b border-border last:border-b-0" />
          ))}
        </div>
        {/* Mobile skeleton */}
        <div className="md:hidden flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Invoices"
        description={
          invoices.length > 0
            ? `${filteredSorted.length} of ${invoices.length} total · ${formatMoney(outstanding)} outstanding`
            : undefined
        }
        actions={
          <Button onClick={openCreate} size="sm" data-tour="invoices-add">
            ⊕ Create Invoice
          </Button>
        }
      />

      {/* ── Error ── */}
      {isError && (
        <Card className="mb-6 border-red/30 bg-red/5">
          <p className="text-red text-sm">API unreachable ({queryError ? String(queryError) : "unknown error"}).</p>
        </Card>
      )}

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
                  <h3 className="text-base font-semibold text-fg">Create Invoice</h3>
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
                  <p className="text-red text-xs mb-3 p-2 rounded bg-red/5">{createError}</p>
                )}

                <div className="space-y-4">
                  <div>
                    <Label className="mb-1.5 block text-xs font-semibold text-fg-muted">Job *</Label>
                    <FormSelect
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
                    <label className="block text-xs font-semibold text-fg-muted mb-1.5">
                      Due date (optional)
                    </label>
                    <Input
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

      {/* ── Search + filter ── */}
      {invoices.length > 0 && (
        <div className="mb-4 flex flex-col sm:flex-row gap-3">
          <Input
            type="search"
            placeholder="Search by invoice number, customer, or job title..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-md"
          />
          <FormSelect
            value={statusFilter}
            onChange={(value) => setStatusFilter(value as StatusFilter)}
            options={STATUS_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }))}
            className="sm:w-48"
          />
        </div>
      )}

      {/* ── Content ── */}
      {invoices.length === 0 && !isError ? (
        <Card>
          <EmptyState
            title="No invoices yet"
            description="Click 'Create Invoice' above to generate one from a job."
          />
        </Card>
      ) : (
        <>
          {/* ═══ Desktop table ═══ */}
          <Card className="p-0 overflow-hidden hidden md:block" data-tour="invoices-list">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortHead field="number" label="Number" />
                  <TableHead>Customer</TableHead>
                  <TableHead>Job</TableHead>
                  <SortHead field="status" label="Status" />
                  <TableHead className="text-right">
                    <span
                      className="inline-flex items-center gap-1 cursor-pointer select-none hover:text-fg transition-colors"
                      onClick={() => handleSort("total")}
                    >
                      Total
                      <span className="text-fg-dim text-[10px] w-3 text-center">
                        {sortField === "total" ? (sortDir === "asc" ? "↑" : "↓") : " "}
                      </span>
                    </span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-10">
                      <p className="text-sm text-fg-muted">
                        No invoices match your filters
                      </p>
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        className="mt-1 h-auto p-0 text-xs"
                        onClick={() => { setSearch(""); setStatusFilter("all"); }}
                      >
                        Clear search
                      </Button>
                    </TableCell>
                  </TableRow>
                ) : (
                  paginated.map((inv) => {
                    const job = jobMap.get(inv.jobId);
                    const cust = job ? customerMap.get(job.customerId) : undefined;
                    return (
                      <TableRow key={inv.id}>
                        <TableCell className="font-medium text-fg font-mono text-xs">
                          <Link
                            href={`/invoices/${inv.id}`}
                            className="hover:text-fg-link transition-colors"
                          >
                            {inv.number}
                          </Link>
                        </TableCell>
                        <TableCell className="text-fg-muted">
                          {cust ?? "—"}
                        </TableCell>
                        <TableCell className="text-fg-muted">
                          {job ? (
                            <Link
                              href={`/jobs/${job.id}`}
                              className="hover:text-fg transition-colors"
                            >
                              {job.title}
                            </Link>
                          ) : "—"}
                        </TableCell>
                        <TableCell>
                          <InvoiceStatusBadge status={inv.status} />
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-fg">
                          {formatMoney(inv.total)}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </Card>

          {/* ═══ Mobile cards ═══ */}
          <div className="md:hidden flex flex-col gap-3">
            {paginated.length === 0 ? (
              <Card>
                <div className="text-center py-10">
                  <p className="text-sm text-fg-muted">
                    No invoices match &ldquo;{search}&rdquo;
                  </p>
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="mt-1 h-auto p-0 text-xs"
                    onClick={() => setSearch("")}
                  >
                    Clear search
                  </Button>
                </div>
              </Card>
            ) : (
                  paginated.map((inv) => {
                    const job = jobMap.get(inv.jobId);
                    const cust = job ? customerMap.get(job.customerId) : undefined;
                    return (
                  <Card key={inv.id} className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Link
                        href={`/invoices/${inv.id}`}
                        className="font-mono text-xs text-fg font-medium hover:text-fg-link transition-colors no-underline"
                      >
                          {inv.number}
                      </Link>
                        <InvoiceStatusBadge status={inv.status} />
                      </div>
                      <span className="text-base font-bold text-fg tabular-nums">
                        {formatMoney(inv.total)}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {cust && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-fg-dim w-16 shrink-0">Customer</span>
                          <Link
                            href={`/customers/${job?.customerId}`}
                            className="text-xs text-fg-link hover:text-fg transition-colors"
                          >
                            {cust}
                          </Link>
                        </div>
                      )}
                      {job && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-fg-dim w-16 shrink-0">Job</span>
                          <Link
                            href={`/jobs/${job.id}`}
                            className="text-xs text-fg-link hover:text-fg transition-colors truncate"
                          >
                            {job.title}
                          </Link>
                        </div>
                      )}
                    </div>
                  </Card>
                );
              })
            )}
          </div>
        </>
      )}

      <Pagination skip={skip} take={take} total={filteredSorted.length} onSkipChange={setSkip} />
    </div>
  );
}
