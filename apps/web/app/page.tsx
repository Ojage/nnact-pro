import Link from "next/link";
import { serverApi } from "@/lib/server-api";
import type { DiagnosticSessionListItem } from "@/lib/diagnostics-api";
import { formatMoney } from "@nnact/shared";
import { JobStatusBadge } from "@/components/status-badge";
import { SponsorSlot } from "@/components/sponsor-slot";
import { Welcome } from "@/components/home/welcome";
import { RouteFirst } from "@/components/home/route-first";

const panel = "min-w-0 rounded-[8px] border border-[var(--shell-border)] bg-[var(--shell-panel)]";

function sessionTone(status: string) {
  if (status === "blocked") return "bg-yellow/10 text-yellow";
  if (status === "escalated") return "bg-red/10 text-red";
  if (["diagnosed", "completed"].includes(status)) return "bg-green/10 text-green";
  return "bg-blue/10 text-blue";
}

export default async function TodayPage() {
  const [jobsResult, appointmentsResult, invoicesResult, customersResult, diagnosticsResult] =
    await Promise.allSettled([
      serverApi.jobs(),
      serverApi.appointments(),
      serverApi.invoices(),
      serverApi.customers(),
      serverApi.diagnosticSessions(),
    ]);

  const jobs = jobsResult.status === "fulfilled" ? jobsResult.value : [];
  const appointments = appointmentsResult.status === "fulfilled" ? appointmentsResult.value : [];
  const invoices = invoicesResult.status === "fulfilled" ? invoicesResult.value : [];
  const customers = customersResult.status === "fulfilled" ? customersResult.value : [];
  const diagnosticSessions: DiagnosticSessionListItem[] =
    diagnosticsResult.status === "fulfilled" ? diagnosticsResult.value : [];

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);

  const todayAppointments = appointments
    .filter((appointment) => {
      const starts = new Date(appointment.startsAt);
      return starts >= todayStart && starts < tomorrowStart;
    })
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

  const activeInvoiceJobIds = new Set(
    invoices.filter((invoice) => invoice.status !== "void").map((invoice) => invoice.jobId),
  );
  const unscheduledLeads = jobs.filter((job) => job.status === "lead");
  const inProgress = jobs.filter((job) => job.status === "in_progress");
  const readyToInvoice = jobs.filter(
    (job) => job.status === "completed" && job.total > 0 && !activeInvoiceJobIds.has(job.id),
  );
  const needsPricing = jobs.filter(
    (job) => job.status === "completed" && job.total === 0 && !activeInvoiceJobIds.has(job.id),
  );
  const closeoutAttention = [...inProgress, ...needsPricing, ...readyToInvoice];
  const outstanding = invoices
    .filter((invoice) => invoice.status === "draft" || invoice.status === "sent")
    .reduce((sum, invoice) => sum + invoice.total, 0);
  const customerMap = new Map(customers.map((customer) => [customer.id, customer.name]));
  const apiDown = jobsResult.status === "rejected";
  const longDate = now.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const metrics = [
    {
      label: "Today's visits",
      value: String(todayAppointments.length),
      note: "scheduled on your route",
      href: "/schedule",
      tone: "text-fg",
    },
    {
      label: "Unscheduled leads",
      value: String(unscheduledLeads.length),
      note: unscheduledLeads.length ? "waiting for dispatch" : "pipeline is clear",
      href: "/dispatch",
      tone: unscheduledLeads.length ? "text-yellow" : "text-green",
    },
    {
      label: "In progress",
      value: String(inProgress.length),
      note: "open in the field",
      href: "/jobs",
      tone: inProgress.length ? "text-yellow" : "text-green",
    },
    {
      label: "Ready to invoice",
      value: String(readyToInvoice.length),
      note: "completed and priced",
      href: "/closeout",
      tone: readyToInvoice.length ? "text-green" : "text-fg",
    },
    {
      label: "Outstanding",
      value: formatMoney(outstanding),
      note: "draft and sent invoices",
      href: "/invoices",
      tone: outstanding ? "text-yellow" : "text-green",
    },
  ];

  const route = (
    <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,.95fr)]">
      <section aria-labelledby="route-title" className={panel}>
        <header className="flex items-start justify-between gap-3 border-b border-[var(--shell-border)] px-5 py-4">
          <div>
            <h3 id="route-title" className="text-base font-medium text-fg">Today&apos;s route</h3>
            <p className="mt-0.5 text-xs text-fg-muted">Open the work order, review arrival notes, and continue field work.</p>
          </div>
          <Link href="/schedule" className="shrink-0 text-sm font-medium text-[var(--shell-accent-text)]">Full schedule</Link>
        </header>
        <div className="px-5 py-4">
          {todayAppointments.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm font-medium text-fg">No appointments today</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-fg-muted">Unscheduled and return-visit work remains available in the jobs pipeline.</p>
            </div>
          ) : (
            <ol className="divide-y divide-[var(--shell-border)]">
              {todayAppointments.map((appointment) => {
                const job = jobs.find((item) => item.id === appointment.jobId);
                const session = diagnosticSessions.find((item) => item.session.jobId === appointment.jobId);
                const starts = new Date(appointment.startsAt);
                const ends = new Date(appointment.endsAt);
                return (
                  <li key={appointment.id} className="flex items-start gap-4 py-3 first:pt-0 last:pb-0">
                    <div className="w-20 shrink-0 text-sm tabular-nums">
                      <p className="font-medium text-fg">{starts.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</p>
                      <p className="text-xs text-fg-muted">to {ends.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <Link href={`/jobs/${appointment.jobId}`} className="text-sm font-medium text-[var(--shell-accent-text)]">
                          {job?.title || "Service job"}
                        </Link>
                        {session && (
                          <Link
                            href={`/diagnostics/${session.session.id}`}
                            className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium capitalize no-underline ${sessionTone(session.session.status)}`}
                          >
                            Record · {session.session.status.replaceAll("_", " ")}
                          </Link>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-fg-muted">
                        {job ? customerMap.get(job.customerId) || "Customer unavailable" : "Work-order details unavailable"}
                      </p>
                      {job && <div className="mt-2"><JobStatusBadge status={job.status} /></div>}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </section>

      <section aria-labelledby="closeout-title" className={panel}>
        <header className="flex items-start justify-between gap-3 border-b border-[var(--shell-border)] px-5 py-4">
          <div>
            <h3 id="closeout-title" className="text-base font-medium text-fg">Closeout attention</h3>
            <p className="mt-0.5 text-xs text-fg-muted">Active work and completed visits that still need pricing or an invoice.</p>
          </div>
          <Link href="/closeout" className="shrink-0 text-sm font-medium text-[var(--shell-accent-text)]">Closeout board</Link>
        </header>
        {closeoutAttention.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <p className="text-sm font-medium text-fg">All caught up</p>
            <p className="mt-1 text-sm text-fg-muted">No jobs require closeout action.</p>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--shell-border)]">
            {closeoutAttention.slice(0, 7).map((job) => {
              const label = job.status === "in_progress" ? "In progress" : job.total === 0 ? "Needs pricing" : "Ready to invoice";
              const urgent = job.total === 0 && job.status === "completed";
              return (
                <li key={job.id}>
                  <Link
                    href="/closeout"
                    className="flex items-start justify-between gap-3 px-5 py-3 no-underline hover:bg-[var(--shell-hover)]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-fg">{job.title}</span>
                      <span className="mt-0.5 block text-xs text-fg-muted">{customerMap.get(job.customerId) || "Customer unavailable"}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span
                        className={`block text-[11px] font-semibold uppercase tracking-wide ${urgent ? "text-red" : "text-fg-muted"}`}
                      >
                        {urgent ? "▲ " : ""}
                        {label}
                      </span>
                      <span className="mt-0.5 block text-sm font-medium text-fg tabular-nums">{formatMoney(job.total)}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );

  const numbers = (
    <ul aria-label="Today's numbers" className="grid grid-cols-2 gap-3 lg:grid-cols-5" role="list">
      {metrics.map((metric) => (
        <li key={metric.label}>
          <Link
            href={metric.href}
            className={`${panel} block h-full px-4 py-3 no-underline transition-colors hover:bg-[var(--shell-hover)]`}
          >
            <span className="block text-xs text-fg-muted">{metric.label}</span>
            <span className="mt-1 block text-2xl font-normal tabular-nums text-fg">{metric.value}</span>
            <span className="mt-1 block text-xs text-fg-muted">{metric.note}</span>
          </Link>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="mx-auto min-w-0 max-w-6xl space-y-10">
      {apiDown && (
        <div role="alert" className="rounded-[8px] border border-red/30 bg-red/5 px-5 py-4">
          <p className="text-sm font-semibold text-red">▲ Operations API is unreachable or the session has expired</p>
          <p className="mt-1 text-xs text-fg-muted">Sign in again or verify the API and reviewed database schema before using the field workflow.</p>
        </div>
      )}

      <Welcome />

      <section id="today" aria-labelledby="today-title" className="scroll-mt-20 space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="today-title" className="text-lg font-normal text-fg">Today at a glance</h2>
          <p className="text-sm text-fg-muted">
            {longDate} ·{" "}
            {needsPricing.length
              ? `${needsPricing.length} completed job${needsPricing.length === 1 ? " needs" : "s need"} pricing before invoicing.`
              : readyToInvoice.length
                ? `${readyToInvoice.length} completed job${readyToInvoice.length === 1 ? " is" : "s are"} ready to invoice.`
                : unscheduledLeads.length
                  ? `${unscheduledLeads.length} lead${unscheduledLeads.length === 1 ? " needs" : "s need"} scheduling.`
                  : "No urgent office handoff is waiting."}
          </p>
        </div>
        <RouteFirst metrics={numbers} route={route} />
      </section>

      <SponsorSlot />
    </div>
  );
}
