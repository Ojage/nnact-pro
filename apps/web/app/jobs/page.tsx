"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, CheckCircle2, CircleDot, Clock, Download, ExternalLink, FileText, Loader, Plus, RefreshCw, Route } from "lucide-react";
import { formatMoney, type JobDTO, type JobStatus } from "@nnact/shared";
import { PrefetchLink as Link } from "@/components/prefetch-link";
import { usePrefetchListDetails } from "@/hooks/use-prefetch-list-details";
import { useCustomersQuery, useJobsQuery, useUsersQuery } from "@/lib/redux/api";
import { Skeleton } from "@/components/ui/skeleton";
import { JobStatusBadge } from "@/components/status-badge";
import {
  Banner,
  ConsoleHeader,
  ConsolePage,
  ResourceTable,
  Tag,
  ToolbarButton,
  ToolbarDivider,
  ToolbarLink,
  downloadCsv,
  resourceLink,
  type Column,
  type Facet,
} from "@/components/console";
import { cn } from "@/lib/utils";

const STATUS_OPTIONS: { value: JobStatus; label: string }[] = [
  { value: "lead", label: "Lead" },
  { value: "scheduled", label: "Scheduled" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "canceled", label: "Canceled" },
];

const SOURCE_OPTIONS = [
  { value: "staff", label: "Staff" },
  { value: "customer_request", label: "Customer request" },
];

/** The four working states as a pipeline strip; each one filters the table. */
const PIPELINE: { status: JobStatus; label: string; icon: typeof Clock }[] = [
  { status: "lead", label: "Leads", icon: CircleDot },
  { status: "scheduled", label: "Scheduled", icon: Clock },
  { status: "in_progress", label: "In progress", icon: Loader },
  { status: "completed", label: "Completed", icon: CheckCircle2 },
];

function formatWhen(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function JobsLoading() {
  return (
    <div className="grid gap-4" aria-busy="true" aria-label="Loading jobs">
      <Skeleton className="h-8 w-40 rounded-[6px]" />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-[4.5rem] rounded-[8px]" />
        ))}
      </div>
      <div className="overflow-hidden rounded-[8px] border border-[var(--shell-border)]">
        <Skeleton className="h-11 rounded-none" />
        {Array.from({ length: 6 }, (_, row) => (
          <div key={row} className="flex h-12 items-center gap-6 border-t border-[var(--shell-border)] px-4">
            <Skeleton className="h-4 w-48 rounded-[6px]" />
            <Skeleton className="h-4 w-24 rounded-[6px]" />
            <Skeleton className="h-4 flex-1 rounded-[6px]" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function JobsPage() {
  const router = useRouter();
  const jobsQuery = useJobsQuery();
  const { data: jobs = [], isLoading, isError } = jobsQuery;
  const { data: customers = [] } = useCustomersQuery();
  const { data: users = [] } = useUsersQuery();
  const [facetValues, setFacetValues] = useState<Record<string, string[]>>({});
  const [visible, setVisible] = useState<JobDTO[]>([]);

  const customerMap = useMemo(() => new Map(customers.map((customer) => [customer.id, customer.name])), [customers]);
  const userMap = useMemo(() => new Map(users.map((user) => [user.id, user.name])), [users]);

  const counts = useMemo(() => {
    const totals: Partial<Record<JobStatus, { count: number; value: number }>> = {};
    for (const job of jobs) {
      const entry = (totals[job.status] ??= { count: 0, value: 0 });
      entry.count += 1;
      entry.value += job.total;
    }
    return totals;
  }, [jobs]);

  usePrefetchListDetails(
    "jobs",
    useMemo(() => visible.slice(0, 40).map((job) => job.id), [visible]),
  );
  const onFilteredChange = useCallback((rows: JobDTO[]) => setVisible(rows), []);

  const columns: Column<JobDTO>[] = [
    {
      id: "title",
      header: "Job",
      sortValue: (job) => job.title,
      cell: (job) => (
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
          <Link href={`/jobs/${job.id}`} data-tour="jobs-link" className={resourceLink}>
            {job.title}
          </Link>
          {job.source && job.source !== "staff" ? <Tag>{job.source.replace("_", " ")}</Tag> : null}
          {job.number ? <span className="w-full font-mono text-[11px] text-fg-muted">{job.number}</span> : null}
        </div>
      ),
    },
    { id: "status", header: "Status", sortValue: (job) => job.status, cell: (job) => <JobStatusBadge status={job.status} /> },
    {
      id: "customer",
      header: "Customer",
      sortValue: (job) => customerMap.get(job.customerId) ?? "",
      cell: (job) =>
        customerMap.get(job.customerId) ? (
          <Link href={`/customers/${job.customerId}`} className="text-fg hover:text-[var(--shell-accent-text)] hover:underline">
            {customerMap.get(job.customerId)}
          </Link>
        ) : (
          <span className="text-fg-muted">—</span>
        ),
    },
    {
      id: "scheduled",
      header: "Scheduled",
      hideBelow: "md",
      sortValue: (job) => job.scheduledAt ?? job.preferredDate ?? "",
      cell: (job) => {
        const when = formatWhen(job.scheduledAt);
        return when ? (
          <span className="whitespace-nowrap text-fg">{when}</span>
        ) : job.preferredDate ? (
          <span className="whitespace-nowrap text-fg-muted">Prefers {job.preferredDate}</span>
        ) : (
          <span className="text-fg-muted">Not scheduled</span>
        );
      },
    },
    {
      id: "assignee",
      header: "Technician",
      hideBelow: "lg",
      sortValue: (job) => (job.assignedTo ? userMap.get(job.assignedTo) ?? "" : ""),
      cell: (job) =>
        job.assignedTo ? <span className="text-fg">{userMap.get(job.assignedTo) ?? "Assigned"}</span> : <span className="text-fg-muted">Unassigned</span>,
    },
    {
      id: "category",
      header: "Service",
      hideBelow: "lg",
      sortValue: (job) => job.serviceCategory ?? "",
      cell: (job) => <span className="text-fg-muted">{job.serviceCategory ?? "—"}</span>,
    },
    {
      id: "total",
      header: "Total",
      align: "right",
      sortValue: (job) => job.total,
      cell: (job) => <span className="whitespace-nowrap font-mono text-fg">{formatMoney(job.total)}</span>,
    },
  ];

  const facets: Facet<JobDTO>[] = [
    { id: "status", label: "Status", options: STATUS_OPTIONS, value: (job) => job.status },
    { id: "source", label: "Source", options: SOURCE_OPTIONS, value: (job) => job.source ?? "staff" },
  ];

  const exportRows = () =>
    downloadCsv(`jobs-${new Date().toISOString().slice(0, 10)}.csv`, visible.length ? visible : jobs, [
      ["Number", (job) => job.number ?? ""],
      ["Title", (job) => job.title],
      ["Status", (job) => job.status],
      ["Customer", (job) => customerMap.get(job.customerId) ?? ""],
      ["Scheduled", (job) => job.scheduledAt ?? ""],
      ["Technician", (job) => (job.assignedTo ? userMap.get(job.assignedTo) ?? "" : "")],
      ["Service", (job) => job.serviceCategory ?? ""],
      ["Total", (job) => (job.total / 100).toFixed(2)],
    ]);

  if (isLoading) return <JobsLoading />;

  const statusFilter = facetValues.status ?? [];

  return (
    <ConsolePage>
      <ConsoleHeader
        title="Jobs"
        meta={jobs.length ? <span>{jobs.length} work orders</span> : null}
        toolbar={
          <>
            <ToolbarLink href="/schedule" icon={Plus} data-tour="jobs-add">
              New Job
            </ToolbarLink>
            <ToolbarButton icon={RefreshCw} spinning={jobsQuery.isFetching} onClick={() => void jobsQuery.refetch()} disabled={jobsQuery.isFetching}>
              Refresh
            </ToolbarButton>
            <ToolbarButton icon={Download} onClick={exportRows} disabled={jobs.length === 0}>
              Export CSV
            </ToolbarButton>
            <ToolbarDivider />
            <ToolbarLink href="/schedule" icon={CalendarDays}>
              Schedule
            </ToolbarLink>
            <ToolbarLink href="/dispatch" icon={Route}>
              Dispatch board
            </ToolbarLink>
          </>
        }
      />

      {isError ? (
        <Banner tone="danger" title="Jobs could not be loaded." action={<ToolbarButton onClick={() => void jobsQuery.refetch()}>Try again</ToolbarButton>}>
          Check your connection and try again.
        </Banner>
      ) : null}

      {jobs.length > 0 ? (
        <nav aria-label="Jobs by status">
          <ul className="grid grid-cols-2 overflow-hidden rounded-[8px] border border-[var(--shell-border)] xl:grid-cols-4" role="list">
            {PIPELINE.map(({ status, label, icon: Icon }, index) => {
              const entry = counts[status];
              const active = statusFilter.length === 1 && statusFilter[0] === status;
              return (
                <li
                  key={status}
                  className={cn(
                    "min-w-0 border-[var(--shell-border)]",
                    index % 2 === 1 && "border-l",
                    index >= 2 && "border-t xl:border-t-0",
                    index === 2 && "xl:border-l",
                  )}
                >
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
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-2xl font-normal tabular-nums text-fg">{entry?.count ?? 0}</span>
                      <span className="text-xs tabular-nums text-fg-muted">{formatMoney(entry?.value ?? 0)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}

      <div data-tour="jobs-list" className="min-w-0">
        <ResourceTable
          caption="Jobs"
          rows={jobs}
          columns={columns}
          getRowId={(job) => job.id}
          rowLabel={(job) => job.title}
          searchText={(job) =>
            [job.title, job.number, customerMap.get(job.customerId), job.status.replace("_", " "), job.serviceCategory, job.serviceAddress]
              .filter(Boolean)
              .join(" ")
          }
          filterPlaceholder="Search by title, number, customer or status"
          facets={facets}
          facetValues={facetValues}
          onFacetValuesChange={setFacetValues}
          defaultSort={{ id: "title", dir: "asc" }}
          minWidth="44rem"
          onFilteredChange={onFilteredChange}
          rowMenu={(job) => [
            { label: "View details", icon: ExternalLink, onSelect: () => router.push(`/jobs/${job.id}`) },
            { label: "Open customer", icon: FileText, onSelect: () => router.push(`/customers/${job.customerId}`) },
            "separator",
            { label: "Open in schedule", icon: CalendarDays, onSelect: () => router.push("/schedule") },
          ]}
          empty={
            <div className="grid justify-items-center gap-2 px-6 py-12 text-center">
              <p className="text-base font-medium text-fg">No jobs yet</p>
              <p className="max-w-md text-sm text-fg-muted">Create your first job from the Schedule page, or take a call with the intake form.</p>
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                <ToolbarLink href="/jobs/new" primary icon={Plus}>
                  Create job
                </ToolbarLink>
                <ToolbarLink href="/schedule" icon={CalendarDays}>
                  Open schedule
                </ToolbarLink>
              </div>
            </div>
          }
        />
      </div>
    </ConsolePage>
  );
}
