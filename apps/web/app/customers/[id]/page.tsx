"use client";

import { Suspense, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { CalendarDays, ExternalLink, Mail, Phone, RefreshCw } from "lucide-react";
import { formatMoney, type JobDTO } from "@nnact/shared";
import { PrefetchLink as Link } from "@/components/prefetch-link";
import { useActivitiesQuery, useCustomerQuery, useJobsQuery } from "@/lib/redux/api";
import { Skeleton } from "@/components/ui/skeleton";
import { JobStatusBadge } from "@/components/status-badge";
import {
  ActivityList,
  ConsoleHeader,
  ConsolePage,
  DetailsCard,
  Panel,
  ResourceTable,
  SummaryCards,
  TabsNav,
  ToolbarButton,
  ToolbarDivider,
  resourceLink,
  toolbarButton,
  useUrlTab,
  type Column,
} from "@/components/console";
import { EditCustomerDialog } from "./edit-dialog";
import { CustomerEquipment } from "./customer-equipment";
import { CustomerServicePlans } from "./customer-service-plans";
import { CustomerPortalLinks } from "./customer-portal-links";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "jobs", label: "Jobs" },
  { id: "portal", label: "Portal links" },
  { id: "activity", label: "Activity" },
] as const;
type TabId = (typeof TABS)[number]["id"];

function CustomerDetail() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const customerId = params.id;

  const customerQuery = useCustomerQuery(customerId, { skip: !customerId });
  const { data: customer, isLoading } = customerQuery;
  const jobsQuery = useJobsQuery();
  const { data: allJobs = [] } = jobsQuery;
  const timelineQuery = useActivitiesQuery({ customerId }, { skip: !customerId });
  const timeline = timelineQuery.data ?? [];
  const customerJobs = useMemo(() => allJobs.filter((j) => j.customerId === customerId), [allJobs, customerId]);
  const tabs = TABS.map((tab) =>
    tab.id === "jobs" ? { ...tab, count: customerJobs.length } : tab.id === "activity" ? { ...tab, count: timeline.length } : tab,
  );
  const tab = useUrlTab<TabId>(tabs);

  if (!customer && isLoading) {
    return (
      <div className="grid gap-4" aria-busy="true" aria-label="Loading customer">
        <Skeleton className="h-4 w-48 rounded-[6px]" />
        <Skeleton className="h-8 w-72 rounded-[6px]" />
        <Skeleton className="h-10 w-full rounded-[6px]" />
        <Skeleton className="h-64 w-full rounded-[8px]" />
      </div>
    );
  }

  if (!customer) {
    return (
      <ConsolePage>
        <ConsoleHeader
          breadcrumb={[{ label: "Customers", href: "/customers" }, { label: "Not found" }]}
          title="Customer not found"
          description={`No customer with id ${customerId} in this organisation.`}
          divider={false}
        />
        <Link href="/customers" className={resourceLink}>
          Back to customers
        </Link>
      </ConsolePage>
    );
  }

  const openJobs = customerJobs.filter((j) => j.status === "lead" || j.status === "scheduled" || j.status === "in_progress");
  const lifetime = customerJobs.filter((j) => j.status === "completed").reduce((sum, j) => sum + j.total, 0);
  const lastJob = [...customerJobs].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

  const jobColumns: Column<JobDTO>[] = [
    {
      id: "title",
      header: "Job",
      sortValue: (j) => j.title,
      cell: (j) => (
        <Link href={`/jobs/${j.id}`} className={resourceLink}>
          {j.title}
        </Link>
      ),
    },
    { id: "status", header: "Status", sortValue: (j) => j.status, cell: (j) => <JobStatusBadge status={j.status} /> },
    {
      id: "created",
      header: "Created",
      sortValue: (j) => j.createdAt,
      cell: (j) => <span className="whitespace-nowrap text-fg-muted">{new Date(j.createdAt).toLocaleDateString()}</span>,
    },
    { id: "total", header: "Total", align: "right", sortValue: (j) => j.total, cell: (j) => <span className="font-mono">{formatMoney(j.total)}</span> },
  ];

  return (
    <ConsolePage>
      <ConsoleHeader
        breadcrumb={[{ label: "Customers", href: "/customers" }, { label: customer.name }]}
        title={customer.name}
        meta={<span>Customer since {new Date(customer.createdAt).toLocaleDateString()}</span>}
        divider={false}
        toolbarLabel={`${customer.name} actions`}
        toolbar={
          <>
            <EditCustomerDialog customer={customer} />
            {customer.phone ? (
              <a href={`tel:${customer.phone}`} className={toolbarButton}>
                <Phone className="size-4" aria-hidden="true" />
                Call
              </a>
            ) : null}
            {customer.email ? (
              <a href={`mailto:${customer.email}`} className={toolbarButton}>
                <Mail className="size-4" aria-hidden="true" />
                Email
              </a>
            ) : null}
            <ToolbarDivider />
            <ToolbarButton
              icon={RefreshCw}
              spinning={customerQuery.isFetching || jobsQuery.isFetching}
              onClick={() => {
                void customerQuery.refetch();
                void jobsQuery.refetch();
                void timelineQuery.refetch();
              }}
            >
              Refresh
            </ToolbarButton>
          </>
        }
      />

      <TabsNav tabs={tabs} current={tab} label={`${customer.name} sections`} />

      {tab === "overview" ? (
        <div className="grid gap-4">
          <SummaryCards
            label="Customer at a glance"
            items={[
              { label: "Open jobs", value: openJobs.length, note: openJobs.length ? "Leads, scheduled or in progress" : "Nothing open" },
              { label: "Total jobs", value: customerJobs.length, note: lastJob ? `Latest ${new Date(lastJob.createdAt).toLocaleDateString()}` : "No work orders yet" },
              { label: "Completed work", value: formatMoney(lifetime), note: "Sum of completed job totals" },
            ]}
          />
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
            <DetailsCard
              rows={[
                ["Name", customer.name],
                ["Email", customer.email ? <a className={resourceLink} href={`mailto:${customer.email}`}>{customer.email}</a> : null],
                ["Phone", customer.phone ? <a className={resourceLink} href={`tel:${customer.phone}`}>{customer.phone}</a> : null],
                ["Address", customer.primaryAddress],
                ["Added", new Date(customer.createdAt).toLocaleString()],
                ["Customer ID", <span key="id" className="font-mono text-xs">{customer.id}</span>],
              ]}
            />
            <Panel
              title="Recent jobs"
              flush
              actions={
                customerJobs.length > 5 ? (
                  <Link href="?tab=jobs" scroll={false} className="text-sm font-medium text-[var(--shell-accent-text)] hover:underline">
                    View all {customerJobs.length}
                  </Link>
                ) : null
              }
            >
              {customerJobs.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-fg-muted">No work orders yet for this customer.</p>
              ) : (
                <ul role="list">
                  {customerJobs.slice(0, 5).map((j) => (
                    <li key={j.id} className="flex items-center gap-3 border-b border-[var(--shell-border)] px-4 py-2.5 last:border-b-0">
                      <Link href={`/jobs/${j.id}`} className={`${resourceLink} min-w-0 flex-1 truncate`}>
                        {j.title}
                      </Link>
                      <JobStatusBadge status={j.status} />
                      <span className="w-24 shrink-0 text-right font-mono text-sm tabular-nums text-fg">{formatMoney(j.total)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <CustomerEquipment customerId={customerId} />
            <CustomerServicePlans customerId={customerId} />
          </div>
          <Panel title="Latest activity" description="Notes, status changes, payments and messages for this customer.">
            <ActivityList items={timeline.slice(0, 6)} empty="No recorded activity yet." />
          </Panel>
        </div>
      ) : null}

      {tab === "jobs" ? (
        <ResourceTable
          caption={`Jobs for ${customer.name}`}
          rows={customerJobs}
          columns={jobColumns}
          getRowId={(j) => j.id}
          rowLabel={(j) => j.title}
          searchText={(j) => `${j.title} ${j.status} ${j.serviceCategory ?? ""}`}
          filterPlaceholder="Filter this customer's jobs"
          defaultSort={{ id: "created", dir: "desc" }}
          minWidth="36rem"
          rowMenu={(j) => [
            { label: "View job", icon: ExternalLink, onSelect: () => router.push(`/jobs/${j.id}`) },
            { label: "Open schedule", icon: CalendarDays, onSelect: () => router.push("/schedule") },
          ]}
          empty={<p className="py-8 text-center text-sm text-fg-muted">No work orders yet for this customer.</p>}
        />
      ) : null}

      {tab === "portal" ? <CustomerPortalLinks customerId={customerId} /> : null}
      {tab === "activity" ? (
        <Panel title="Activity" description="Most recent events first.">
          <ActivityList items={timeline} empty="No recorded activity yet." />
        </Panel>
      ) : null}
    </ConsolePage>
  );
}

export default function CustomerDetailPage() {
  return (
    <Suspense>
      <CustomerDetail />
    </Suspense>
  );
}
