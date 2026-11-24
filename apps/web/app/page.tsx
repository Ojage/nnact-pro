import Link from "next/link";
import { serverApi } from "@/lib/server-api";
import type { DiagnosticSessionListItem } from "@/lib/diagnostics-api";
import { formatMoney } from "@nnact/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { JobStatusBadge } from "@/components/status-badge";
import { SponsorSlot } from "@/components/sponsor-slot";

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
  const completedRevenue = jobs
    .filter((job) => job.status === "completed")
    .reduce((sum, job) => sum + job.total, 0);
  const activeDiagnostics = diagnosticSessions.filter((item) =>
    ["workflow_ready", "testing", "blocked", "escalated"].includes(item.session.status),
  );
  const customerMap = new Map(customers.map((customer) => [customer.id, customer.name]));
  const apiDown = jobsResult.status === "rejected";
  const nextVisit = todayAppointments[0] ?? null;
  const nextVisitJob = nextVisit ? jobs.find((job) => job.id === nextVisit.jobId) : undefined;
  const greeting = now.getHours() < 12 ? "Good morning" : now.getHours() < 17 ? "Good afternoon" : "Good evening";
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

  return (
    <div className="space-y-7">
      {apiDown && (
        <Card className="border-red/30 bg-red/5">
          <CardContent className="pt-5">
            <p className="text-sm font-semibold text-red">Operations API is unreachable or the session has expired</p>
            <p className="mt-1 text-xs text-fg-muted">Sign in again or verify the API and reviewed database schema before using the field workflow.</p>
          </CardContent>
        </Card>
      )}

      <section className="ofp-command-gradient apple-surface relative overflow-hidden p-6 sm:p-8">
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="apple-eyebrow">{longDate}</p>
            <h1 className="mt-3 text-[34px] font-bold leading-[1.05] tracking-[-0.04em] text-fg sm:text-[48px]">{greeting}.</h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-fg-muted sm:text-base">
              A quiet view of what matters now: today&apos;s route, work in motion, and the next office handoff.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link href="/jobs/new">
                <Button variant="secondary">New job</Button>
              </Link>
              <Link href="/dispatch">
                <Button>Open dispatch</Button>
              </Link>
            </div>
          </div>
          <div className="w-full max-w-md rounded-[22px] border border-border bg-card/75 p-5 shadow-[var(--card-shadow)] backdrop-blur-xl">
            <p className="apple-eyebrow">Next visit</p>
            {nextVisit ? (
              <>
                <p className="mt-3 text-[28px] font-bold tracking-[-0.03em] text-fg tabular-nums">
                  {new Date(nextVisit.startsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                </p>
                <p className="mt-1 text-sm font-semibold text-fg">{nextVisitJob?.title || "Service job"}</p>
                <p className="mt-1 text-xs text-fg-muted">
                  {nextVisitJob ? customerMap.get(nextVisitJob.customerId) || "Customer unavailable" : "Work-order details unavailable"}
                </p>
                <Link href={`/jobs/${nextVisit.jobId}`} className="mt-4 inline-flex text-sm font-semibold text-fg-link">
                  Open work order →
                </Link>
              </>
            ) : (
              <>
                <p className="mt-3 text-[28px] font-bold tracking-[-0.03em] text-fg">Clear</p>
                <p className="mt-1 text-sm text-fg-muted">No visits remain today. Open dispatch to schedule open work.</p>
                <Link href="/dispatch" className="mt-4 inline-flex text-sm font-semibold text-fg-link">
                  Go to dispatch →
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      <SponsorSlot />

      <section aria-label="Today's metrics" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {metrics.map((metric) => (
          <Link key={metric.label} href={metric.href} className="apple-tile no-underline">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-dim">{metric.label}</p>
            <p className={`mt-3 text-[28px] font-bold leading-none tracking-[-0.03em] tabular-nums ${metric.tone}`}>
              {metric.value}
            </p>
            <p className="mt-2 text-xs text-fg-muted">{metric.note}</p>
          </Link>
        ))}
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.05fr_.95fr]">
        <Card className="p-0">
          <CardHeader className="flex-row items-center justify-between px-6 pb-4 pt-6">
            <div>
              <CardTitle className="apple-section-title">Today&apos;s route</CardTitle>
              <p className="mt-1 text-xs text-fg-muted">Open the work order, review arrival notes, and continue field work.</p>
            </div>
            <Link href="/schedule" className="text-xs font-semibold text-fg-link">Full schedule →</Link>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            {todayAppointments.length === 0 ? (
              <div className="apple-empty border border-dashed border-border bg-surface-100">
                <p className="font-semibold text-fg">No appointments today</p>
                <p className="max-w-sm text-sm text-fg-muted">Unscheduled and return-visit work remains available in the jobs pipeline.</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {todayAppointments.map((appointment) => {
                  const job = jobs.find((item) => item.id === appointment.jobId);
                  const session = diagnosticSessions.find((item) => item.session.jobId === appointment.jobId);
                  const starts = new Date(appointment.startsAt);
                  const ends = new Date(appointment.endsAt);
                  return (
                    <div key={appointment.id} className="flex items-start gap-4 py-4 first:pt-0 last:pb-0">
                      <div className="w-20 shrink-0 rounded-2xl bg-surface-100 px-3 py-2 text-center">
                        <p className="text-sm font-bold text-fg tabular-nums">
                          {starts.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                        </p>
                        <p className="mt-0.5 text-[10px] text-fg-dim tabular-nums">
                          to {ends.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                        </p>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <Link href={`/jobs/${appointment.jobId}`} className="text-sm font-semibold text-fg-link">
                              {job?.title || "Service job"}
                            </Link>
                            {job && <div className="mt-2"><JobStatusBadge status={job.status} /></div>}
                          </div>
                          {session && (
                            <Link
                              href={`/diagnostics/${session.session.id}`}
                              className={`rounded-full px-2.5 py-1 text-[10px] font-semibold capitalize no-underline ${sessionTone(session.session.status)}`}
                            >
                              optional record · {session.session.status.replaceAll("_", " ")}
                            </Link>
                          )}
                        </div>
                        <p className="mt-2 text-xs text-fg-muted">
                          {job ? customerMap.get(job.customerId) || "Customer unavailable" : "Work-order details unavailable"}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="p-0">
          <CardHeader className="flex-row items-center justify-between px-6 pb-4 pt-6">
            <div>
              <CardTitle className="apple-section-title">Closeout attention</CardTitle>
              <p className="mt-1 text-xs text-fg-muted">Active work and completed visits that still need pricing or an invoice.</p>
            </div>
            <Link href="/closeout" className="text-xs font-semibold text-fg-link">Closeout board →</Link>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            {closeoutAttention.length === 0 ? (
              <div className="apple-empty border border-dashed border-border bg-surface-100">
                <p className="font-semibold text-fg">All caught up</p>
                <p className="text-sm text-fg-muted">No jobs require closeout action.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {closeoutAttention.slice(0, 7).map((job) => {
                  const label = job.status === "in_progress"
                    ? "In progress"
                    : job.total === 0
                      ? "Needs pricing"
                      : "Ready to invoice";
                  const urgent = job.total === 0 && job.status === "completed";
                  return (
                    <Link
                      key={job.id}
                      href="/closeout"
                      className={`block rounded-2xl border p-4 no-underline transition-all duration-200 hover:-translate-y-0.5 ${
                        urgent ? "border-red/25 bg-red/5" : "border-border bg-surface-100 hover:bg-surface-200"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-fg">{job.title}</p>
                          <p className="mt-1 text-xs text-fg-muted">{customerMap.get(job.customerId) || "Customer unavailable"}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-fg-dim">{label}</p>
                          <p className="mt-1 text-sm font-bold text-fg tabular-nums">{formatMoney(job.total)}</p>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="apple-section-title">Operations snapshot</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between border-b border-border pb-2"><span className="text-fg-muted">Customers</span><span className="font-semibold text-fg tabular-nums">{customers.length}</span></div>
            <div className="flex justify-between border-b border-border pb-2"><span className="text-fg-muted">Completed revenue</span><span className="font-semibold text-green tabular-nums">{formatMoney(completedRevenue)}</span></div>
            <div className="flex justify-between"><span className="text-fg-muted">Outstanding invoices</span><span className="font-semibold text-yellow tabular-nums">{formatMoney(outstanding)}</span></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="apple-section-title">Next office action</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed text-fg-muted">
              {needsPricing.length
                ? `${needsPricing.length} completed job${needsPricing.length === 1 ? "" : "s"} need pricing before invoicing.`
                : readyToInvoice.length
                  ? `${readyToInvoice.length} completed job${readyToInvoice.length === 1 ? " is" : "s are"} ready to invoice.`
                  : unscheduledLeads.length
                    ? `${unscheduledLeads.length} lead${unscheduledLeads.length === 1 ? " needs" : "s need"} scheduling.`
                    : "No urgent office handoff is waiting."}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="apple-section-title">Optional technical records</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed text-fg-muted">
              {activeDiagnostics.length} active equipment record{activeDiagnostics.length === 1 ? "" : "s"}. Technical evidence stays attached to the commercial work order without replacing job status, billing, or customer history.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
