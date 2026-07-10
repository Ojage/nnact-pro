import Link from "next/link";
import { api } from "@/lib/api";
import { diagnosticsApi, type DiagnosticSessionListItem } from "@/lib/diagnostics-api";
import { formatMoney } from "@ofp/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { JobStatusBadge } from "@/components/status-badge";

function sessionTone(status: string) {
  if (status === "blocked") return "bg-yellow/10 text-yellow";
  if (status === "escalated") return "bg-red/10 text-red";
  if (["diagnosed", "completed"].includes(status)) return "bg-green/10 text-green";
  return "bg-blue/10 text-blue";
}

export default async function TodayPage() {
  const [jobsResult, appointmentsResult, invoicesResult, customersResult, diagnosticsResult] =
    await Promise.allSettled([
      api.jobs(),
      api.appointments(),
      api.invoices(),
      api.customers(),
      diagnosticsApi.sessions(),
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
    .sort(
      (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
    );

  const activeDiagnostics = diagnosticSessions.filter((item) =>
    ["workflow_ready", "testing", "blocked", "escalated"].includes(item.session.status),
  );
  const blockedDiagnostics = activeDiagnostics.filter(
    (item) => item.session.status === "blocked" || item.session.status === "escalated",
  );
  const outstanding = invoices
    .filter((invoice) => invoice.status === "draft" || invoice.status === "sent")
    .reduce((sum, invoice) => sum + invoice.total, 0);
  const completedRevenue = jobs
    .filter((job) => job.status === "completed")
    .reduce((sum, job) => sum + job.total, 0);
  const apiDown = jobsResult.status === "rejected";

  return (
    <div>
      <PageHeader
        title="Today"
        description="The next appointment, exact appliance, diagnostic state, and work required to close the job."
        actions={
          <div className="flex gap-2">
            <Link href="/diagnostics/new">
              <Button variant="secondary" size="sm">Start diagnostic</Button>
            </Link>
            <Link href="/schedule">
              <Button size="sm">Open dispatch</Button>
            </Link>
          </div>
        }
      />

      {apiDown && (
        <Card className="mb-6 border-red/30 bg-red/5">
          <CardContent className="pt-5">
            <p className="text-sm font-semibold text-red">Operations API is unreachable</p>
            <p className="mt-1 text-xs text-fg-muted">Start the API and apply the database schema before using the field workflow.</p>
          </CardContent>
        </Card>
      )}

      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          ["Today’s visits", todayAppointments.length, "text-blue"],
          ["Active diagnostics", activeDiagnostics.length, "text-blue"],
          ["Needs attention", blockedDiagnostics.length, blockedDiagnostics.length ? "text-red" : "text-green"],
          ["Open jobs", jobs.filter((job) => !["completed", "canceled"].includes(job.status)).length, "text-yellow"],
          ["Outstanding", formatMoney(outstanding), outstanding ? "text-yellow" : "text-green"],
        ].map(([label, value, tone]) => (
          <Card key={String(label)}>
            <CardContent className="p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-fg-dim">{label}</p>
              <p className={`mt-1 text-2xl font-bold ${tone}`}>{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_.95fr]">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Today’s route</CardTitle>
              <p className="mt-1 text-xs text-fg-muted">Open the work order, verify the appliance, and download the diagnostic package before arrival.</p>
            </div>
            <Link href="/schedule" className="text-xs text-fg-link">Full schedule →</Link>
          </CardHeader>
          <CardContent>
            {todayAppointments.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-8 text-center">
                <p className="font-semibold text-fg">No appointments today</p>
                <p className="mt-1 text-sm text-fg-muted">Unscheduled and return-visit work remains available in the jobs pipeline.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {todayAppointments.map((appointment) => {
                  const job = jobs.find((item) => item.id === appointment.jobId);
                  const session = diagnosticSessions.find((item) => item.session.jobId === appointment.jobId);
                  const starts = new Date(appointment.startsAt);
                  const ends = new Date(appointment.endsAt);
                  return (
                    <div key={appointment.id} className="rounded-xl border border-border bg-surface-200 p-4">
                      <div className="flex items-start gap-4">
                        <div className="min-w-20 rounded-lg bg-surface-100 px-3 py-2 text-center">
                          <p className="text-sm font-bold text-fg">
                            {starts.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                          </p>
                          <p className="text-[10px] text-fg-dim">
                            to {ends.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                          </p>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <Link href={`/jobs/${appointment.jobId}`} className="font-semibold text-fg-link">
                                {job?.title || "Service job"}
                              </Link>
                              {job && <div className="mt-1"><JobStatusBadge status={job.status} /></div>}
                            </div>
                            {session ? (
                              <Link
                                href={`/diagnostics/${session.session.id}`}
                                className={`rounded-full px-2.5 py-1 text-[10px] font-semibold capitalize no-underline ${sessionTone(session.session.status)}`}
                              >
                                {session.session.status.replaceAll("_", " ")}
                              </Link>
                            ) : (
                              <Link href="/diagnostics/new" className="rounded-full bg-surface-400 px-2.5 py-1 text-[10px] font-semibold text-fg-muted no-underline">
                                diagnostic not started
                              </Link>
                            )}
                          </div>
                          {session && (
                            <p className="mt-3 text-xs text-fg-muted">
                              {[session.equipment.make, session.equipment.model, session.equipment.serialNumber]
                                .filter(Boolean)
                                .join(" · ") || session.equipment.type}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Diagnostic attention</CardTitle>
              <p className="mt-1 text-xs text-fg-muted">Sessions that are blocked, unresolved, or ready for the next field check.</p>
            </div>
            <Link href="/diagnostics" className="text-xs text-fg-link">Command center →</Link>
          </CardHeader>
          <CardContent>
            {activeDiagnostics.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-fg-muted">
                No active diagnostic sessions.
              </div>
            ) : (
              <div className="space-y-3">
                {activeDiagnostics.slice(0, 7).map(({ session, equipment, workflow }) => (
                  <Link
                    key={session.id}
                    href={`/diagnostics/${session.id}`}
                    className="block rounded-xl border border-border bg-surface-200 p-4 no-underline hover:bg-surface-300"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-fg">
                          {[equipment.make, equipment.model].filter(Boolean).join(" ") || equipment.type}
                        </p>
                        <p className="mt-1 text-xs text-fg-muted">{session.customerComplaint || "Complaint not recorded"}</p>
                        <p className="mt-2 text-[11px] text-fg-dim">{workflow?.name || "Coverage required"}</p>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold capitalize ${sessionTone(session.status)}`}>
                        {session.status.replaceAll("_", " ")}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Operations snapshot</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-fg-muted">Customers</span><span className="font-semibold text-fg">{customers.length}</span></div>
            <div className="flex justify-between"><span className="text-fg-muted">Completed revenue</span><span className="font-semibold text-green">{formatMoney(completedRevenue)}</span></div>
            <div className="flex justify-between"><span className="text-fg-muted">Outstanding invoices</span><span className="font-semibold text-yellow">{formatMoney(outstanding)}</span></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Field rule</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-fg-muted">A job is the commercial container. The appliance and diagnostic session are the technical record. Keep both connected from intake through invoice.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Open-source operations</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-fg-muted">CRM, dispatch, estimates, invoices, payments, service plans, documents, and reporting remain part of the complete operations core.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
