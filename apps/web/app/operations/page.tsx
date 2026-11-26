"use client";

import { useMemo } from "react";
import {
  CalendarDays,
  ClipboardCheck,
  Columns3,
  FileStack,
  HardHat,
  ListChecks,
  Mail,
  Plus,
  RefreshCw,
  Route,
  Tags,
  UserPlus,
  Users,
  Wrench,
} from "lucide-react";
import { PrefetchLink as Link } from "@/components/prefetch-link";
import { useAppointmentsQuery, useCustomersQuery, useInvoicesQuery, useJobsQuery, useUsersQuery } from "@/lib/redux/api";
import { Skeleton } from "@/components/ui/skeleton";
import { JobStatusBadge } from "@/components/status-badge";
import { requestLearn } from "@/lib/walkthroughs/events";
import {
  Banner,
  ColumnChart,
  ConsolePage,
  MeterList,
  Panel,
  ProductTiles,
  ResourceList,
  ServiceOverviewHero,
  SummaryCards,
  ToolbarButton,
  illustrationSrc,
  monthlySeries,
} from "@/components/console";

const viewAll = "text-sm font-medium text-[var(--shell-accent-text)] hover:underline";

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Operations service overview: today's field work, what is waiting, and the operations tools. */
export default function OperationsOverviewPage() {
  const jobsQuery = useJobsQuery();
  const appointmentsQuery = useAppointmentsQuery();
  const { data: jobs = [], isLoading, isError } = jobsQuery;
  const { data: appointments = [] } = appointmentsQuery;
  const { data: customers = [] } = useCustomersQuery();
  const { data: users = [] } = useUsersQuery();
  const { data: invoices = [] } = useInvoicesQuery();

  const customerName = useMemo(() => new Map(customers.map((c) => [c.id, c.name])), [customers]);
  const jobById = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs]);
  const userName = useMemo(() => new Map(users.map((u) => [u.id, u.name])), [users]);

  const today = new Date();
  const todays = useMemo(
    () => appointments.filter((a) => sameDay(new Date(a.startsAt), today)).sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [appointments],
  );
  const leads = jobs.filter((j) => j.status === "lead");
  const unassigned = jobs.filter((j) => j.status === "scheduled" && !j.assignedTo);
  const inProgress = jobs.filter((j) => j.status === "in_progress");
  const invoicedJobs = useMemo(() => new Set(invoices.map((i) => i.jobId)), [invoices]);
  const toClose = jobs.filter((j) => j.status === "completed" && !invoicedJobs.has(j.id));

  const jobsPerMonth = useMemo(() => monthlySeries(jobs, (j) => j.createdAt, () => 1, 6), [jobs]);
  const techLoad = useMemo(() => {
    const counts = new Map<string, number>();
    for (const visit of todays) {
      const key = visit.technicianId ?? "unassigned";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id, count]) => ({
        id,
        label: id === "unassigned" ? "No technician yet" : userName.get(id) ?? "Technician",
        value: count,
        valueText: `${count} visit${count === 1 ? "" : "s"}`,
      }));
  }, [todays, userName]);

  if (isLoading) {
    return (
      <div className="grid gap-6" aria-busy="true" aria-label="Loading operations overview">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
          <Skeleton className="h-44 rounded-[8px]" />
          <Skeleton className="h-44 rounded-[8px]" />
        </div>
        <Skeleton className="h-24 rounded-[8px]" />
        <Skeleton className="h-64 rounded-[8px]" />
      </div>
    );
  }

  return (
    <ConsolePage className="gap-6">
      <ServiceOverviewHero
        title="Operations"
        icon={HardHat}
        description="Take the call, put the visit on the calendar, send the right technician and close the job out. Everything the office does between a request and an invoice."
        meta={
          <>
            <span>{today.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</span>
            <ToolbarButton
              icon={RefreshCw}
              spinning={jobsQuery.isFetching || appointmentsQuery.isFetching}
              onClick={() => {
                void jobsQuery.refetch();
                void appointmentsQuery.refetch();
              }}
              className="-ml-2.5 h-7"
            >
              Refresh
            </ToolbarButton>
          </>
        }
        quickActions={[
          { label: "Take a new job", href: "/jobs/new", icon: Plus },
          { label: "Open dispatch board", href: "/dispatch", icon: Route },
          { label: "Today's schedule", href: "/schedule", icon: CalendarDays },
          { label: "Close out finished jobs", href: "/closeout", icon: ClipboardCheck },
          { label: "Add a customer", href: "/customers", icon: UserPlus },
        ]}
        illustration={{
          image: illustrationSrc("operations"),
          icon: Route,
          title: "From the first call to the closed job.",
          copy: "Intake, dispatch and closeout share one record, so nobody re-types the job.",
          links: [
            { label: "Start a walkthrough", onClick: () => requestLearn() },
            { label: "Operations questions in the FAQ", href: "/help/faq" },
          ],
        }}
      />

      {isError ? <Banner tone="danger" title="Jobs could not be loaded.">Check your connection and try again.</Banner> : null}
      {unassigned.length > 0 ? (
        <Banner
          tone="warning"
          title={`${unassigned.length} scheduled job${unassigned.length === 1 ? " has" : "s have"} no technician.`}
          action={<Link href="/dispatch" className={viewAll}>Assign on the dispatch board</Link>}
        />
      ) : null}

      <SummaryCards
        label="Operations at a glance"
        items={[
          { label: "Visits today", icon: CalendarDays, value: todays.length, note: todays.length ? `First at ${new Date(todays[0].startsAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}` : "Nothing booked today", href: "/schedule" },
          { label: "Leads to schedule", icon: ListChecks, value: leads.length, note: leads.length ? "Waiting for a time slot" : "No leads waiting", href: "/pipeline" },
          { label: "In progress", icon: Wrench, value: inProgress.length, note: "Technicians on site", href: "/dispatch" },
          { label: "Ready to close out", icon: ClipboardCheck, value: toClose.length, note: toClose.length ? "Completed but not invoiced" : "Nothing waiting", attention: toClose.length > 0, href: "/closeout" },
        ]}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Panel title="New jobs per month" description="Work orders opened in the last six months">
          <ColumnChart data={jobsPerMonth} format={(v) => `${v} job${v === 1 ? "" : "s"}`} formatTick={(v) => String(Math.round(v))} integer empty="No jobs were opened in the last six months." label="New jobs per month for the last six months" />
        </Panel>
        <Panel title="Technician load today" description="Visits booked per person" actions={<Link href="/dispatch" className={viewAll}>Dispatch</Link>}>
          <MeterList rows={techLoad} empty="No visits are booked for today." />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <Panel title="Today's visits" flush actions={<Link href="/schedule" className={viewAll}>Schedule</Link>}>
          <ResourceList
            empty="No visits are booked for today."
            rows={todays.slice(0, 6).map((visit) => {
              const job = jobById.get(visit.jobId);
              return {
                id: visit.id,
                href: `/jobs/${visit.jobId}`,
                primary: job?.title ?? "Job",
                secondary: `${new Date(visit.startsAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })} · ${visit.technicianId ? userName.get(visit.technicianId) ?? "Technician" : "No technician"}`,
                status: job ? <JobStatusBadge status={job.status} /> : undefined,
              };
            })}
          />
        </Panel>
        <Panel title="Leads waiting" flush actions={<Link href="/pipeline" className={viewAll}>Pipeline</Link>}>
          <ResourceList
            empty="No leads are waiting to be scheduled."
            rows={[...leads]
              .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
              .slice(0, 6)
              .map((job) => ({
                id: job.id,
                href: `/jobs/${job.id}`,
                primary: job.title,
                secondary: `${customerName.get(job.customerId) ?? "Customer"} · opened ${new Date(job.createdAt).toLocaleDateString()}`,
              }))}
          />
        </Panel>
        <Panel title="Ready to close out" flush actions={<Link href="/closeout" className={viewAll}>Closeout</Link>} className="lg:col-span-2 xl:col-span-1">
          <ResourceList
            empty="Every completed job has an invoice."
            rows={toClose.slice(0, 6).map((job) => ({
              id: job.id,
              href: `/jobs/${job.id}`,
              primary: job.title,
              secondary: customerName.get(job.customerId) ?? "Customer",
              status: <JobStatusBadge status={job.status} />,
            }))}
          />
        </Panel>
      </div>

      <ProductTiles
        title="Operations products"
        tiles={[
          { href: "/dispatch", icon: Route, name: "Dispatch Board", description: "Assign technicians and balance the day's visits.", meta: unassigned.length ? `${unassigned.length} unassigned` : undefined },
          { href: "/schedule", icon: CalendarDays, name: "Schedule", description: "Day and week calendar of every visit.", meta: `${todays.length} today` },
          { href: "/closeout", icon: ClipboardCheck, name: "Job Closeout", description: "Price, invoice and close finished work.", meta: toClose.length ? `${toClose.length} waiting` : undefined },
          { href: "/pipeline", icon: Columns3, name: "Pipeline", description: "Jobs by stage, from lead to completed.", meta: `${jobs.length} jobs` },
          { href: "/customers", icon: Users, name: "Customers & Equipment", description: "Contacts, sites and the units you service.", meta: `${customers.length} customers` },
          { href: "/documents", icon: FileStack, name: "Documents", description: "Generated estimates, invoices and reports." },
          { href: "/price-book", icon: Tags, name: "Price Book", description: "Standard parts, labour and service prices." },
          { href: "/newsletter", icon: Mail, name: "Newsletter", description: "Subscribers and customer newsletters." },
        ]}
      />
    </ConsolePage>
  );
}
