"use client";

import { Suspense } from "react";
import { PrefetchLink as Link } from "@/components/prefetch-link";
import { useParams } from "next/navigation";
import { CalendarDays, ClipboardCheck, RefreshCw, RotateCcw, Stethoscope, User } from "lucide-react";
import {
  useActivitiesQuery,
  useAppointmentsQuery,
  useCustomersQuery,
  useDiagnosticSessionsQuery,
  useJobQuery,
  useUsersQuery,
} from "@/lib/redux/api";
import type { DiagnosticSessionListItem } from "@/lib/diagnostics-api";
import { formatMoney } from "@nnact/shared";
import { InfoTip } from "@/components/ui/info-tip";
import { Skeleton } from "@/components/ui/skeleton";
import { JobStatusBadge } from "@/components/status-badge";
import { JobRepairBrainWorkflow } from "@/components/job-repair-brain-workflow";
import { EmptyState } from "@/components/empty-state";
import { JobVoiceNotesPanel } from "@/components/job-voice-notes";
import { JobPricingPanel } from "@/components/job-pricing-panel";
import { JobPurchaseLog } from "@/components/job-purchase-log";
import { JobQuickMoney } from "@/components/job-quick-money";
import { UserAvatar } from "@/components/user-avatar";
import {
  ActivityList,
  ConsoleHeader,
  ConsolePage,
  Facts,
  Panel,
  TabsNav,
  Tag,
  ToolbarButton,
  ToolbarDivider,
  ToolbarLink,
  resourceLink,
  useUrlTab,
} from "@/components/console";

interface Appointment {
  id: string;
  jobId: string;
  technicianId: string | null;
  startsAt: string;
  endsAt: string;
}

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "money", label: "Pricing & money" },
  { id: "visits", label: "Visits" },
  { id: "notes", label: "Voice notes" },
  { id: "activity", label: "Activity" },
] as const;
type TabId = (typeof TABS)[number]["id"];

function Term({ label, tip }: { label: string; tip: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      {label}
      <InfoTip label={`About ${label.toLowerCase()}`} side="top">
        {tip}
      </InfoTip>
    </span>
  );
}

function JobDetail() {
  const params = useParams<{ id: string }>();
  const jobId = params.id;

  const jobQuery = useJobQuery(jobId, { skip: !jobId });
  const { data: job, isLoading } = jobQuery;
  const activitiesQuery = useActivitiesQuery({ jobId }, { skip: !jobId });
  const activities = activitiesQuery.data ?? [];
  const { data: appointments = [] } = useAppointmentsQuery();
  const { data: customers = [] } = useCustomersQuery();
  const { data: diagnosticRows = [] } = useDiagnosticSessionsQuery({ jobId }, { skip: !jobId });
  const { data: users = [] } = useUsersQuery();

  const customer = job ? customers.find((item) => item.id === job.customerId) : null;
  const jobAppointments = (appointments as Appointment[]).filter((item) => item.jobId === jobId);
  const technicianById = new Map(users.filter((u) => u.active).map((u) => [u.id, u]));
  const diagnostic: DiagnosticSessionListItem | null = diagnosticRows[0] ?? null;
  const tabs = TABS.map((tab) =>
    tab.id === "visits" ? { ...tab, count: jobAppointments.length } : tab.id === "activity" ? { ...tab, count: activities.length } : tab,
  );
  const tab = useUrlTab<TabId>(tabs);

  if (!job && isLoading) {
    return (
      <div className="grid gap-4" aria-busy="true" aria-label="Loading job">
        <Skeleton className="h-4 w-48 rounded-[6px]" />
        <Skeleton className="h-8 w-80 rounded-[6px]" />
        <Skeleton className="h-10 w-full rounded-[6px]" />
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <Skeleton className="h-96 rounded-[8px]" />
          <Skeleton className="h-96 rounded-[8px]" />
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <ConsolePage>
        <ConsoleHeader
          breadcrumb={[{ label: "Jobs", href: "/jobs" }, { label: "Not found" }]}
          title="Job not found"
          description={`No job with id ${jobId} in this organization.`}
          divider={false}
        />
        <EmptyState title="No job data" description="Verify the work-order ID, authentication session, or API connection." />
      </ConsolePage>
    );
  }

  const scheduled = job.scheduledAt
    ? new Date(job.scheduledAt).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : null;
  const assignee = job.assignedTo ? users.find((u) => u.id === job.assignedTo) : null;

  return (
    <ConsolePage>
      <ConsoleHeader
        breadcrumb={[{ label: "Jobs", href: "/jobs" }, { label: job.number ?? job.title }]}
        title={job.title}
        status={<JobStatusBadge status={job.status} />}
        meta={
          <>
            {job.number ? <span className="font-mono">{job.number}</span> : null}
            {customer ? (
              <Link href={`/customers/${customer.id}`} className="text-[var(--shell-accent-text)] hover:underline">
                {customer.name}
              </Link>
            ) : null}
            {scheduled ? <span>{scheduled}</span> : <span>Not scheduled</span>}
          </>
        }
        divider={false}
        toolbarLabel={`${job.title} actions`}
        toolbar={
          <>
            {diagnostic ? (
              <ToolbarLink href={`/diagnostics/${diagnostic.session.id}`} icon={Stethoscope}>
                Full diagnostic UI
              </ToolbarLink>
            ) : (
              <ToolbarLink href={`/diagnostics/new?jobId=${jobId}`} icon={Stethoscope}>
                Add equipment record
              </ToolbarLink>
            )}
            {job.status === "completed" ? (
              <ToolbarLink href={`/quality/comebacks/new?jobId=${jobId}`} icon={RotateCcw}>
                Report comeback
              </ToolbarLink>
            ) : null}
            <ToolbarLink href="/closeout" icon={ClipboardCheck}>
              Closeout
            </ToolbarLink>
            <ToolbarLink href="/schedule" icon={CalendarDays}>
              Schedule
            </ToolbarLink>
            {customer ? (
              <ToolbarLink href={`/customers/${customer.id}`} icon={User}>
                Customer
              </ToolbarLink>
            ) : null}
            <ToolbarDivider />
            <ToolbarButton
              icon={RefreshCw}
              spinning={jobQuery.isFetching}
              onClick={() => {
                void jobQuery.refetch();
                void activitiesQuery.refetch();
              }}
            >
              Refresh
            </ToolbarButton>
          </>
        }
      />

      <TabsNav tabs={tabs} current={tab} label={`${job.title} sections`} />

      {tab === "overview" ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="grid min-w-0 content-start gap-4">
            <Panel title="Details" description="Status, pricing, scheduling and intake details for this work order.">
              <div data-tour="job-detail-status">
                <Facts
                  termWidth="11rem"
                  rows={[
                    [
                      "Status",
                      <JobStatusBadge key="status" status={job.status} />,
                    ],
                    ["Current total", <span key="total" className="font-mono">{formatMoney(job.total)}</span>],
                    ["Created", new Date(job.createdAt).toLocaleDateString()],
                    ["Scheduled", job.scheduledAt ? new Date(job.scheduledAt).toLocaleString() : "Not scheduled"],
                    ["Technician", assignee ? assignee.name : job.assignedTo ? "Assigned" : "Unassigned"],
                    ["Source", job.source && job.source !== "staff" ? <Tag key="src">{job.source.replace("_", " ")}</Tag> : "Staff"],
                    ["Service category", job.serviceCategory],
                    ["Service address", job.serviceAddress],
                    ["Preferred date", job.preferredDate],
                    ["Preferred time", job.preferredTime],
                  ]}
                />
              </div>
              {job.description ? (
                <div className="mt-4 border-t border-[var(--shell-border)] pt-3">
                  <p className="text-sm text-fg-muted">
                    <Term
                      label="Customer complaint and access notes"
                      tip="What the customer reported and any gate codes, parking, or site instructions for the technician."
                    />
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-fg">{job.description}</p>
                </div>
              ) : null}
            </Panel>

            <div data-tour="job-detail-diagnose" className="min-w-0">
              <JobRepairBrainWorkflow jobId={job.id} customerId={job.customerId} jobStatus={job.status} jobDescription={job.description} />
            </div>
          </div>

          <div className="grid min-w-0 content-start gap-4">
            {customer ? (
              <Panel title="Customer">
                <Facts
                  termWidth="7rem"
                  rows={[
                    ["Name", <Link key="n" href={`/customers/${customer.id}`} className={resourceLink}>{customer.name}</Link>],
                    ["Email", customer.email],
                    ["Phone", customer.phone ? <a key="p" className={resourceLink} href={`tel:${customer.phone}`}>{customer.phone}</a> : null],
                    ["Since", new Date(customer.createdAt).toLocaleDateString()],
                  ]}
                />
              </Panel>
            ) : null}
            <JobQuickMoney job={job} />
            <AppointmentsPanel appointments={jobAppointments} technicianById={technicianById} />
          </div>
        </div>
      ) : null}

      {tab === "money" ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="grid min-w-0 content-start gap-4">
            <JobPricingPanel job={job} />
          </div>
          <div className="grid min-w-0 content-start gap-4">
            <JobQuickMoney job={job} />
            <JobPurchaseLog jobId={job.id} />
          </div>
        </div>
      ) : null}

      {tab === "visits" ? <AppointmentsPanel appointments={jobAppointments} technicianById={technicianById} /> : null}

      {tab === "notes" ? <JobVoiceNotesPanel jobId={jobId} /> : null}

      {tab === "activity" ? (
        <Panel title="Activity" description="Status changes, notes and system events recorded on this job.">
          <ActivityList items={activities} empty="No activity yet for this job." />
        </Panel>
      ) : null}
    </ConsolePage>
  );
}

function AppointmentsPanel({
  appointments,
  technicianById,
}: {
  appointments: Appointment[];
  technicianById: Map<string, { name: string; title: string | null; profilePictureUrl: string | null }>;
}) {
  return (
    <Panel
      title="Appointments"
      description={appointments.length ? `${appointments.length} appointment${appointments.length === 1 ? "" : "s"}` : "Not yet scheduled"}
      flush
      actions={
        <ToolbarLink href="/schedule" icon={CalendarDays}>
          {appointments.length ? "Open schedule" : "Schedule this job"}
        </ToolbarLink>
      }
    >
      {appointments.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-fg-muted">No visit is on the calendar yet.</p>
      ) : (
        <ul role="list">
          {appointments.map((appointment) => {
            const technician = appointment.technicianId ? technicianById.get(appointment.technicianId) : null;
            return (
              <li key={appointment.id} className="grid gap-1 border-b border-[var(--shell-border)] px-4 py-3 last:border-b-0">
                <p className="text-sm text-fg">
                  <span className="font-medium">{new Date(appointment.startsAt).toLocaleString()}</span>
                  <span className="text-fg-muted"> to {new Date(appointment.endsAt).toLocaleTimeString()}</span>
                </p>
                {technician ? (
                  <span className="flex items-center gap-1.5 text-xs text-fg-muted">
                    <UserAvatar name={technician.name} src={technician.profilePictureUrl} size="xs" />
                    {technician.name}
                    {technician.title ? ` · ${technician.title}` : ""}
                  </span>
                ) : (
                  <span className="text-xs text-fg-muted">No technician assigned</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

export default function JobDetailPage() {
  return (
    <Suspense>
      <JobDetail />
    </Suspense>
  );
}
