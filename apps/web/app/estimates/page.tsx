"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock, CircleDashed, Download, ExternalLink, Eye, FilePlus2, FileText, RefreshCw, Send, XCircle } from "lucide-react";
import { PrefetchLink as Link } from "@/components/prefetch-link";
import { usePrefetchListDetails } from "@/hooks/use-prefetch-list-details";
import { explainRtkError, useCreateEstimateMutation, useCustomersQuery, useEstimatesQuery, useJobsQuery } from "@/lib/redux/api";
import type { Estimate } from "@/lib/api";
import { formatMoney } from "@nnact/shared";
import type { JobDTO, CustomerDTO } from "@nnact/shared";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { FormSelect } from "@/components/ui/form-select";
import { Label } from "@/components/ui/label";
import { EstimateStatusBadge } from "@/components/status-badge";
import {
  Banner,
  ConsoleHeader,
  ConsolePage,
  ResourceTable,
  ToolbarButton,
  downloadCsv,
  primaryButton,
  resourceLink,
  type Column,
  type Facet,
} from "@/components/console";
import { cn } from "@/lib/utils";

const STAGES = [
  { status: "draft", label: "Draft", icon: CircleDashed },
  { status: "sent", label: "Sent", icon: Send },
  { status: "approved", label: "Approved", icon: CheckCircle2 },
  { status: "declined", label: "Declined", icon: XCircle },
  { status: "expired", label: "Expired", icon: Clock },
] as const;

export default function EstimatesPage() {
  const router = useRouter();
  const estimatesQuery = useEstimatesQuery();
  const { data: estimates = [], isLoading, isError } = estimatesQuery;
  const { data: jobs = [] } = useJobsQuery();
  const { data: customers = [] } = useCustomersQuery();
  const [createEstimate, { isLoading: createSubmitting }] = useCreateEstimateMutation();
  const [facetValues, setFacetValues] = useState<Record<string, string[]>>({});
  const [visible, setVisible] = useState<Estimate[]>([]);

  // ── Create estimate modal ──
  const [showCreate, setShowCreate] = useState(false);
  const [createJobId, setCreateJobId] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  // Jobs that don't already have an estimate
  const estimatedJobIds = useMemo(() => new Set(estimates.map((e) => e.jobId)), [estimates]);
  const unestimatedJobs = useMemo(
    () => jobs.filter((j) => !estimatedJobIds.has(j.id) && j.status !== "canceled"),
    [jobs, estimatedJobIds],
  );

  const handleCreateEstimate = async () => {
    if (!createJobId) return;
    setCreateError(null);
    try {
      await createEstimate({ jobId: createJobId }).unwrap();
      setShowCreate(false);
      setCreateJobId("");
    } catch (e) {
      setCreateError(explainRtkError(e, "Could not create the estimate"));
    }
  };

  const openCreate = () => {
    setCreateJobId("");
    setCreateError(null);
    setShowCreate(true);
  };

  // Escape key handler for create modal
  useEffect(() => {
    if (!showCreate) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowCreate(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showCreate]);

  const jobMap = useMemo(() => new Map<string, JobDTO>(jobs.map((j) => [j.id, j])), [jobs]);
  const customerMap = useMemo(() => new Map<string, CustomerDTO>(customers.map((c) => [c.id, c])), [customers]);
  const customerOf = (estimate: Estimate) => {
    const job = jobMap.get(estimate.jobId);
    return job ? customerMap.get(job.customerId) ?? null : null;
  };

  const stageTotals = useMemo(() => {
    const totals: Record<string, { count: number; value: number }> = {};
    for (const estimate of estimates) {
      const entry = (totals[estimate.status] ??= { count: 0, value: 0 });
      entry.count += 1;
      entry.value += estimate.total;
    }
    return totals;
  }, [estimates]);
  const decided = (stageTotals.approved?.count ?? 0) + (stageTotals.declined?.count ?? 0);
  const winRate = decided ? Math.round(((stageTotals.approved?.count ?? 0) / decided) * 100) : null;

  usePrefetchListDetails(
    "estimates",
    useMemo(() => visible.slice(0, 40).map((e) => e.id), [visible]),
  );
  const onFilteredChange = useCallback((rows: Estimate[]) => setVisible(rows), []);

  const exportRows = (rows: readonly Estimate[]) =>
    downloadCsv(`estimates-${new Date().toISOString().slice(0, 10)}.csv`, rows, [
      ["Number", (e) => e.number],
      ["Status", (e) => e.status],
      ["Job", (e) => jobMap.get(e.jobId)?.title ?? ""],
      ["Customer", (e) => customerOf(e)?.name ?? ""],
      ["Total", (e) => (e.total / 100).toFixed(2)],
      ["Created", (e) => e.createdAt],
      ["Expires", (e) => e.expiresAt ?? ""],
    ]);

  const columns: Column<Estimate>[] = [
    {
      id: "number",
      header: "Estimate",
      sortValue: (e) => e.number,
      cell: (e) => (
        <span className="grid">
          <Link href={`/estimates/${e.id}`} className={`${resourceLink} font-mono`}>
            {e.number}
          </Link>
          {e.revision && e.revision > 1 ? <span className="text-[11px] text-fg-muted">Revision {e.revision}</span> : null}
        </span>
      ),
    },
    { id: "status", header: "Status", sortValue: (e) => e.status, cell: (e) => <EstimateStatusBadge status={e.status} /> },
    {
      id: "job",
      header: "Job",
      sortValue: (e) => jobMap.get(e.jobId)?.title ?? "",
      cell: (e) => {
        const job = jobMap.get(e.jobId);
        return job ? (
          <Link href={`/jobs/${job.id}`} className="block max-w-[18rem] truncate text-fg hover:text-[var(--shell-accent-text)] hover:underline">
            {job.title}
          </Link>
        ) : (
          <span className="text-fg-muted">—</span>
        );
      },
    },
    {
      id: "customer",
      header: "Customer",
      hideBelow: "md",
      sortValue: (e) => customerOf(e)?.name ?? "",
      cell: (e) => <span className="text-fg-muted">{customerOf(e)?.name ?? "—"}</span>,
    },
    {
      id: "expires",
      header: "Expires",
      hideBelow: "lg",
      sortValue: (e) => e.expiresAt ?? "",
      cell: (e) => {
        if (!e.expiresAt) return <span className="text-fg-muted">No expiry</span>;
        const past = new Date(e.expiresAt).getTime() < Date.now();
        return (
          <span className={cn("whitespace-nowrap", past ? "text-[var(--console-danger-fg)]" : "text-fg-muted")}>
            {past ? "Expired " : ""}
            {new Date(e.expiresAt).toLocaleDateString()}
          </span>
        );
      },
    },
    {
      id: "date",
      header: "Created",
      hideBelow: "sm",
      sortValue: (e) => e.createdAt,
      cell: (e) => <span className="whitespace-nowrap text-fg-muted">{new Date(e.createdAt).toLocaleDateString()}</span>,
    },
    {
      id: "total",
      header: "Total",
      align: "right",
      sortValue: (e) => e.total,
      cell: (e) => <span className="whitespace-nowrap font-mono text-fg">{formatMoney(e.total)}</span>,
    },
  ];

  const facets: Facet<Estimate>[] = [
    { id: "status", label: "Status", options: STAGES.map((stage) => ({ value: stage.status, label: stage.label })), value: (e) => e.status },
  ];
  const statusFilter = facetValues.status ?? [];

  if (isLoading) {
    return (
      <div className="grid gap-4" aria-busy="true" aria-label="Loading estimates">
        <Skeleton className="h-8 w-40 rounded-[6px]" />
        <Skeleton className="h-20 rounded-[8px]" />
        <Skeleton className="h-80 rounded-[8px]" />
      </div>
    );
  }

  return (
    <ConsolePage>
      <ConsoleHeader
        title="Estimates"
        meta={winRate !== null ? <span>Win rate {winRate}% of decided estimates</span> : null}
        toolbar={
          <>
            <ToolbarButton icon={FilePlus2} onClick={openCreate} data-tour="estimates-add">
              Create Estimate
            </ToolbarButton>
            <ToolbarButton icon={Download} onClick={() => exportRows(visible.length ? visible : estimates)} disabled={estimates.length === 0}>
              Export CSV
            </ToolbarButton>
            <ToolbarButton icon={RefreshCw} spinning={estimatesQuery.isFetching} disabled={estimatesQuery.isFetching} onClick={() => void estimatesQuery.refetch()}>
              Refresh
            </ToolbarButton>
          </>
        }
      />

      {/* ── Create Estimate modal ── */}
      {showCreate && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowCreate(false)}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <Card className="w-full max-w-md" data-tour="estimates-form">
              <form
                onSubmit={(e) => { e.preventDefault(); handleCreateEstimate(); }}
                className="p-6"
              >
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-medium text-fg">Create Estimate</h2>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-auto p-0 text-lg leading-none text-fg-muted hover:text-fg"
                    onClick={() => setShowCreate(false)}
                    aria-label="Close"
                  >
                    ✕
                  </Button>
                </div>

                {createError && (
                  <p role="alert" className="mb-3 rounded-[6px] bg-[color-mix(in_srgb,var(--console-danger-fg)_8%,transparent)] p-2 text-sm text-[var(--console-danger-fg)]">{createError}</p>
                )}

                <p className="mb-3 text-sm text-fg-muted">
                  Generates an estimate that snapshots the job&rsquo;s current total.
                </p>

                <div>
                  <Label htmlFor="create-job" className="mb-1.5 block text-sm font-medium text-fg">
                    Job *
                  </Label>
                  <FormSelect
                    id="create-job"
                    value={createJobId}
                    onChange={setCreateJobId}
                    allowEmpty
                    placeholder="Select a job..."
                    emptyLabel="Select a job..."
                    options={unestimatedJobs.map((j) => {
                      const cust = customerMap.get(j.customerId);
                      return {
                        value: j.id,
                        label: `${j.title}${cust ? ` — ${cust.name}` : ""} · ${formatMoney(j.total)}`,
                      };
                    })}
                  />
                  {unestimatedJobs.length === 0 && (
                    <p className="text-xs text-fg-dim mt-1">All jobs already have estimates.</p>
                  )}
                </div>

                <div className="flex gap-2 mt-6">
                  <Button type="submit" loading={createSubmitting} disabled={!createJobId}>
                    Create Estimate
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => setShowCreate(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            </Card>
          </div>
        </>
      )}


      {isError ? (
        <Banner tone="danger" title="Estimates could not be loaded.">
          Check your connection and try again.
        </Banner>
      ) : null}

      {estimates.length > 0 ? (
        <nav aria-label="Estimates by stage">
          <ol className="grid grid-cols-2 gap-px overflow-hidden rounded-[8px] border border-[var(--shell-border)] bg-[var(--shell-border)] sm:grid-cols-3 xl:grid-cols-5" role="list">
            {STAGES.map(({ status, label, icon: Icon }) => {
              const entry = stageTotals[status];
              const active = statusFilter.length === 1 && statusFilter[0] === status;
              return (
                <li key={status} className="min-w-0 bg-[var(--shell-panel)]">
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => setFacetValues(active ? {} : { status: [status] })}
                    className={cn(
                      "relative grid h-full w-full gap-1 px-4 py-3 text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--shell-focus)]",
                      active
                        ? "bg-[var(--shell-tint)] after:absolute after:inset-x-0 after:bottom-0 after:border-b-[3px] after:border-[var(--shell-accent-bar)]"
                        : "hover:bg-[var(--shell-canvas)]",
                    )}
                  >
                    <span className="flex items-center gap-2 text-xs font-medium text-fg-muted">
                      <Icon className="size-4" aria-hidden="true" />
                      {label}
                    </span>
                    <span className="text-2xl font-normal tabular-nums text-fg">{entry?.count ?? 0}</span>
                    <span className="text-xs tabular-nums text-fg-muted">{formatMoney(entry?.value ?? 0)}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
      ) : null}

      <div data-tour="estimates-list" className="min-w-0">
        <ResourceTable
          caption="Estimates"
          rows={estimates}
          columns={columns}
          getRowId={(e) => e.id}
          rowLabel={(e) => e.number}
          searchText={(e) => [e.number, jobMap.get(e.jobId)?.title, customerOf(e)?.name, e.status].filter(Boolean).join(" ")}
          filterPlaceholder="Search by estimate number, job or customer"
          facets={facets}
          facetValues={facetValues}
          onFacetValuesChange={setFacetValues}
          defaultSort={{ id: "date", dir: "desc" }}
          minWidth="44rem"
          selectable
          bulkActions={(selected) => (
            <ToolbarButton icon={Download} onClick={() => exportRows(selected)}>
              Export selected
            </ToolbarButton>
          )}
          onFilteredChange={onFilteredChange}
          rowMenu={(e) => [
            { label: "View estimate", icon: ExternalLink, onSelect: () => router.push(`/estimates/${e.id}`) },
            { label: "Preview document", icon: Eye, onSelect: () => router.push(`/estimates/${e.id}/preview`) },
            "separator",
            { label: "Open job", icon: FileText, onSelect: () => router.push(`/jobs/${e.jobId}`) },
          ]}
          empty={
            <div className="grid justify-items-center gap-2 px-6 py-12 text-center">
              <p className="text-base font-medium text-fg">No estimates yet</p>
              <p className="max-w-md text-sm text-fg-muted">Create an estimate from a job to send good, better and best options for approval.</p>
              <button type="button" className={`${primaryButton} mt-2`} onClick={openCreate}>
                <FilePlus2 className="size-4" aria-hidden="true" />
                Create Estimate
              </button>
            </div>
          }
        />
      </div>
    </ConsolePage>
  );
}
