"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  formatMoney,
  type CurrencyCode,
  type CustomerAppointmentDTO,
  type CustomerCommunicationDTO,
  type CustomerDashboardDTO,
  type CustomerDocumentDTO,
  type CustomerEquipmentDTO,
  type CustomerEstimateDetailDTO,
  type CustomerEstimateSummaryDTO,
  type CustomerInvoiceDetailDTO,
  type CustomerInvoiceSummaryDTO,
  type CustomerJobDetailDTO,
  type CustomerJobSummaryDTO,
  type CustomerNotificationDTO,
  type CustomerPortalProfileDTO,
  type CustomerPreferencesDTO,
  type CustomerPropertyDTO,
  type CustomerReviewDTO,
  type CustomerServicePlanDetailDTO,
  type CustomerSupportRequestDTO,
} from "@nnact/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { customerApi, customerFileUrl } from "@/lib/customer-api";
import { clearCustomerSession, loadCustomerSession, saveCustomerSession, sessionOrgId, type CustomerSession } from "@/lib/customer-session";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "appointments", label: "Appointments" },
  { id: "estimates", label: "Estimates" },
  { id: "invoices", label: "Invoices" },
  { id: "service", label: "Service history" },
  { id: "equipment", label: "Equipment" },
  { id: "properties", label: "Properties" },
  { id: "documents", label: "Documents" },
  { id: "plans", label: "Service plans" },
  { id: "reviews", label: "Reviews" },
  { id: "notifications", label: "Notifications" },
  { id: "support", label: "Support" },
  { id: "profile", label: "Profile" },
  { id: "preferences", label: "Preferences" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const API_CURRENCY: CurrencyCode = "XAF";

function dateLabel(value?: string | null, withTime = false): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return withTime ? date.toLocaleString() : date.toLocaleDateString();
}

function money(cents: number, currency: CurrencyCode) {
  return formatMoney(cents, currency);
}

function useResource<T>(load: () => Promise<T>, deps: React.DependencyList) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    load()
      .then((value) => {
        if (alive) setData(value);
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : "Unable to load this section.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, setData, loading, error, setError };
}

function SectionState({ loading, error }: { loading: boolean; error: string | null }) {
  if (loading) return <p className="py-10 text-center text-sm text-fg-muted">Loading...</p>;
  if (error) return <p className="rounded-lg bg-red/10 px-4 py-3 text-sm text-red">{error}</p>;
  return null;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-fg-muted">{children}</p>;
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "paid" || status === "completed" || status === "approved" || status === "active" || status === "operational"
      ? "bg-green-500/10 text-green-700"
      : status === "sent" || status === "scheduled" || status === "confirmed"
        ? "bg-blue-500/10 text-blue-700"
        : status === "open" || status === "pending"
          ? "bg-amber-500/10 text-amber-700"
          : "bg-surface-300 text-fg-muted";
  return <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide", tone)}>{status.replaceAll("_", " ")}</span>;
}

function SectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div>
      <h2 className="text-xl font-black tracking-tight text-fg">{title}</h2>
      {description ? <p className="mt-1 text-sm text-fg-muted">{description}</p> : null}
    </div>
  );
}

export function CustomerAccount() {
  const [session, setSession] = useState<CustomerSession | null>(null);
  const [ready, setReady] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setSession(loadCustomerSession());
    setReady(true);
  }, []);

  if (!ready) {
    return <p className="py-20 text-center text-sm text-fg-muted">Loading your account...</p>;
  }

  const orgId = sessionOrgId(session);
  if (!session || !orgId) {
    return (
      <Card className="mx-auto max-w-lg text-center">
        <CardHeader>
          <CardTitle>Sign in to your account</CardTitle>
          <CardDescription>View appointments, estimates, invoices, documents and service plans.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link href="/login" className="rounded-lg bg-accent px-5 py-2.5 text-sm font-bold text-white no-underline">
            Sign in
          </Link>
          <Link href="/signup" className="rounded-lg border border-border px-5 py-2.5 text-sm font-bold text-fg no-underline">
            Create account
          </Link>
        </CardContent>
      </Card>
    );
  }

  function signOut() {
    clearCustomerSession();
    setSession(null);
    router.push("/");
  }

  function switchOrg(nextOrgId: string) {
    if (!session) return;
    const next = { ...session, activeOrgId: nextOrgId };
    saveCustomerSession(next);
    setSession(next);
  }

  return <CustomerWorkspace session={session} orgId={orgId} onSignOut={signOut} onSwitchOrg={switchOrg} />;
}

function CustomerWorkspace({
  session,
  orgId,
  onSignOut,
  onSwitchOrg,
}: {
  session: CustomerSession;
  orgId: string;
  onSignOut: () => void;
  onSwitchOrg: (orgId: string) => void;
}) {
  const [tab, setTab] = useState<TabId>("overview");
  const dashboard = useResource(() => customerApi.dashboard(orgId), [orgId]);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("tab");
    if (requested && TABS.some((item) => item.id === requested)) setTab(requested as TabId);
  }, []);

  if (dashboard.loading) {
    return <p className="py-20 text-center text-sm text-fg-muted">Loading your dashboard...</p>;
  }
  if (dashboard.error || !dashboard.data) {
    return (
      <Card className="mx-auto max-w-lg">
        <CardHeader>
          <CardTitle>We couldn't load your account</CardTitle>
          <CardDescription>{dashboard.error ?? "Please try again."}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => window.location.reload()}>Try again</Button>
        </CardContent>
      </Card>
    );
  }

  const data = dashboard.data;
  const currency = data.org.currency ?? API_CURRENCY;
  const orgLabel = session.orgs.find((org) => org.orgId === orgId)?.orgName ?? data.org.name;
  const unread = data.stats.unreadNotifications;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-accent">Customer account</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-fg">{orgLabel}</h1>
          <p className="mt-1 text-sm text-fg-muted">{session.user.name} · {session.user.email}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {session.orgs.length > 1 ? (
            <select
              className="h-10 rounded-lg border border-border bg-surface-50 px-3 text-sm text-fg"
              value={orgId}
              onChange={(event) => onSwitchOrg(event.target.value)}
            >
              {session.orgs.map((org) => (
                <option key={org.orgId} value={org.orgId}>{org.orgName}</option>
              ))}
            </select>
          ) : null}
          <Button variant="outline" onClick={onSignOut}>Sign out</Button>
        </div>
      </div>

      <div className="mt-6 flex gap-1 overflow-x-auto border-b border-border pb-2">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={cn(
              "relative shrink-0 cursor-pointer rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
              tab === item.id ? "bg-accent text-white" : "text-fg-muted hover:bg-surface-200 hover:text-fg",
            )}
          >
            {item.label}
            {item.id === "notifications" && unread > 0 ? (
              <span className="ml-1.5 rounded-full bg-red px-1.5 py-0.5 text-[10px] font-bold text-white">{unread}</span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === "overview" ? <OverviewSection data={data} currency={currency} onTab={setTab} /> : null}
        {tab === "appointments" ? <AppointmentsSection orgId={orgId} /> : null}
        {tab === "estimates" ? <EstimatesSection orgId={orgId} currency={currency} /> : null}
        {tab === "invoices" ? <InvoicesSection orgId={orgId} currency={currency} /> : null}
        {tab === "service" ? <JobsSection orgId={orgId} currency={currency} /> : null}
        {tab === "equipment" ? <EquipmentSection orgId={orgId} currency={currency} /> : null}
        {tab === "properties" ? <PropertiesSection orgId={orgId} /> : null}
        {tab === "documents" ? <DocumentsSection orgId={orgId} /> : null}
        {tab === "plans" ? <PlansSection orgId={orgId} currency={currency} /> : null}
        {tab === "reviews" ? <ReviewsSection orgId={orgId} currency={currency} /> : null}
        {tab === "notifications" ? <NotificationsSection orgId={orgId} onRead={() => void dashboard.setData({ ...data, stats: { ...data.stats, unreadNotifications: 0 } })} /> : null}
        {tab === "support" ? <SupportSection orgId={orgId} /> : null}
        {tab === "profile" ? <ProfileSection orgId={orgId} /> : null}
        {tab === "preferences" ? <PreferencesSection orgId={orgId} /> : null}
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <p className="text-xs font-bold uppercase tracking-wide text-fg-dim">{label}</p>
      <p className="mt-2 text-2xl font-black text-fg">{value}</p>
      {hint ? <p className="mt-1 text-xs text-fg-muted">{hint}</p> : null}
    </Card>
  );
}

function OverviewSection({ data, currency, onTab }: { data: CustomerDashboardDTO; currency: CurrencyCode; onTab: (tab: TabId) => void }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Outstanding" value={money(data.stats.outstandingBalance, currency)} hint={`${data.stats.unpaidInvoices} unpaid invoice(s)`} />
        <Stat label="Pending estimates" value={String(data.stats.pendingEstimates)} hint="Awaiting your decision" />
        <Stat label="Upcoming visits" value={String(data.stats.upcomingAppointments)} hint={data.nextAppointment ? dateLabel(data.nextAppointment.startsAt, true) : "Nothing scheduled"} />
        <Stat label="Lifetime spend" value={money(data.stats.lifetimeSpend, currency)} hint={`${data.stats.activePlans} active plan(s)`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Next appointment</CardTitle>
          </CardHeader>
          <CardContent>
            {data.nextAppointment ? (
              <div className="space-y-1 text-sm">
                <p className="font-bold text-fg">{data.nextAppointment.jobTitle}</p>
                <p className="text-fg-muted">{dateLabel(data.nextAppointment.startsAt, true)}</p>
                <p className="text-fg-muted">{data.nextAppointment.serviceAddress ?? "Address on file"}</p>
                {data.nextAppointment.technicianName ? <p className="text-fg-muted">Technician: {data.nextAppointment.technicianName}</p> : null}
                <Button className="mt-3" variant="outline" size="sm" onClick={() => onTab("appointments")}>Manage appointment</Button>
              </div>
            ) : (
              <Empty>No upcoming appointments.</Empty>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
          </CardHeader>
          <CardContent>
            {data.recentNotifications.length === 0 ? (
              <Empty>You're all caught up.</Empty>
            ) : (
              <ul className="space-y-3">
                {data.recentNotifications.map((item) => (
                  <li key={item.id} className="text-sm">
                    <p className="font-semibold text-fg">{item.title}</p>
                    {item.body ? <p className="text-fg-muted">{item.body}</p> : null}
                    <p className="text-xs text-fg-dim">{dateLabel(item.createdAt, true)}</p>
                  </li>
                ))}
              </ul>
            )}
            <Button className="mt-4" variant="outline" size="sm" onClick={() => onTab("notifications")}>Open notifications</Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Estimates waiting on you</CardTitle>
          </CardHeader>
          <CardContent>
            {data.pendingEstimates.length === 0 ? (
              <Empty>No estimates need a decision.</Empty>
            ) : (
              <ul className="divide-y divide-border">
                {data.pendingEstimates.map((estimate) => (
                  <li key={estimate.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                    <div>
                      <p className="font-semibold text-fg">{estimate.number} · {estimate.jobTitle}</p>
                      <p className="text-xs text-fg-muted">Expires {dateLabel(estimate.expiresAt)}</p>
                    </div>
                    <p className="font-bold text-fg">{money(estimate.total, currency)}</p>
                  </li>
                ))}
              </ul>
            )}
            <Button className="mt-4" variant="outline" size="sm" onClick={() => onTab("estimates")}>View estimates</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent service</CardTitle>
          </CardHeader>
          <CardContent>
            {data.recentJobs.length === 0 ? (
              <Empty>No service history yet.</Empty>
            ) : (
              <ul className="divide-y divide-border">
                {data.recentJobs.map((job) => (
                  <li key={job.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                    <div>
                      <p className="font-semibold text-fg">{job.title}</p>
                      <p className="text-xs text-fg-muted">{job.number ?? "Job"} · {dateLabel(job.createdAt)}</p>
                    </div>
                    <StatusPill status={job.status} />
                  </li>
                ))}
              </ul>
            )}
            <Button className="mt-4" variant="outline" size="sm" onClick={() => onTab("service")}>Open service history</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function AppointmentsSection({ orgId }: { orgId: string }) {
  const [version, setVersion] = useState(0);
  const appointments = useResource(() => customerApi.appointments(orgId), [orgId, version]);
  const requests = useResource(() => customerApi.appointmentRequests(orgId), [orgId, version]);
  const [action, setAction] = useState<string | null>(null);
  const [mode, setMode] = useState<"reschedule" | "cancel">("reschedule");
  const [when, setWhen] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submitRequest(appointment: CustomerAppointmentDTO) {
    setBusy(true);
    setMessage(null);
    try {
      await customerApi.requestAppointment(orgId, appointment.id, {
        type: mode,
        requestedStartsAt: mode === "reschedule" ? new Date(when).toISOString() : undefined,
        reason: reason.trim() || undefined,
      });
      setMessage(mode === "reschedule" ? "Reschedule request sent. The team will confirm the new time." : "Cancellation request sent.");
      setAction(null);
      setWhen("");
      setReason("");
      setVersion((value) => value + 1);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to send request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <SectionHeader title="Appointments" description="See upcoming visits and request a new time or cancellation." />
      {message ? <p className="rounded-lg bg-surface-200 px-4 py-3 text-sm text-fg">{message}</p> : null}
      <SectionState loading={appointments.loading} error={appointments.error} />
      {appointments.data && appointments.data.length === 0 ? <Empty>No appointments scheduled yet.</Empty> : null}
      {appointments.data?.map((appointment) => (
        <Card key={appointment.id}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <CardTitle>{appointment.jobTitle}</CardTitle>
                <StatusPill status={appointment.jobStatus} />
              </div>
              <p className="mt-1 text-sm text-fg-muted">{dateLabel(appointment.startsAt, true)} → {dateLabel(appointment.endsAt, true)}</p>
              <p className="text-sm text-fg-muted">{appointment.serviceAddress ?? "Address on file"}</p>
              {appointment.technicianName ? <p className="text-sm text-fg-muted">Technician: {appointment.technicianName}</p> : null}
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                {appointment.rescheduleRequestPending ? <StatusPill status="pending reschedule" /> : null}
                {appointment.cancelRequestPending ? <StatusPill status="pending cancellation" /> : null}
              </div>
            </div>
            {appointment.upcoming ? (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => { setAction(appointment.id); setMode("reschedule"); }}>Reschedule</Button>
                <Button size="sm" variant="danger" onClick={() => { setAction(appointment.id); setMode("cancel"); }}>Cancel</Button>
              </div>
            ) : null}
          </div>
          {action === appointment.id ? (
            <div className="mt-4 rounded-xl bg-surface-200 p-4">
              <p className="text-sm font-bold text-fg">{mode === "reschedule" ? "Request a new time" : "Request cancellation"}</p>
              {mode === "reschedule" ? (
                <Input className="mt-2 bg-surface-50" type="datetime-local" value={when} onChange={(event) => setWhen(event.target.value)} />
              ) : null}
              <Input className="mt-2 bg-surface-50" placeholder="Reason (optional)" value={reason} onChange={(event) => setReason(event.target.value)} />
              <div className="mt-3 flex gap-2">
                <Button size="sm" disabled={busy || (mode === "reschedule" && !when)} onClick={() => void submitRequest(appointment)}>
                  {busy ? "Sending..." : "Send request"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setAction(null)}>Cancel</Button>
              </div>
            </div>
          ) : null}
        </Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle>Recent requests</CardTitle>
        </CardHeader>
        <CardContent>
          {requests.data && requests.data.length === 0 ? <Empty>No change requests yet.</Empty> : null}
          {requests.data?.length ? (
            <ul className="divide-y divide-border">
              {requests.data.map((request) => (
                <li key={request.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <div>
                    <p className="font-semibold capitalize text-fg">{request.type} request</p>
                    {request.requestedStartsAt ? <p className="text-xs text-fg-muted">Requested {dateLabel(request.requestedStartsAt, true)}</p> : null}
                    {request.reason ? <p className="text-xs text-fg-muted">{request.reason}</p> : null}
                  </div>
                  <StatusPill status={request.status} />
                </li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function EstimatesSection({ orgId, currency }: { orgId: string; currency: CurrencyCode }) {
  const [selected, setSelected] = useState<string | null>(null);
  const detail = useResource(
    () => (selected ? customerApi.estimate(orgId, selected) : Promise.resolve(null)),
    [orgId, selected],
  );
  const estimates = useResource(() => customerApi.estimates(orgId), [orgId]);

  if (selected) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>← Back to estimates</Button>
        <SectionState loading={detail.loading} error={detail.error} />
        {detail.data ? <EstimateDetail estimate={detail.data} currency={currency} /> : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SectionHeader title="Estimates" description="Review options, line items and download a PDF copy." />
      <SectionState loading={estimates.loading} error={estimates.error} />
      {estimates.data && estimates.data.length === 0 ? <Empty>No estimates yet.</Empty> : null}
      {estimates.data?.map((estimate) => (
        <Card key={estimate.id} className="cursor-pointer hover:border-accent" onClick={() => setSelected(estimate.id)}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <CardTitle>{estimate.number}</CardTitle>
                <StatusPill status={estimate.status} />
              </div>
              <p className="mt-1 text-sm text-fg-muted">{estimate.jobTitle}</p>
              <p className="text-xs text-fg-dim">Created {dateLabel(estimate.createdAt)} · Expires {dateLabel(estimate.expiresAt)}</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-black text-fg">{money(estimate.total, currency)}</p>
              <a className="text-xs font-semibold text-accent no-underline" href={customerFileUrl(`/customer-auth/orgs/${orgId}/estimates/${estimate.id}/pdf`)} target="_blank" rel="noreferrer">Download PDF</a>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function EstimateDetail({ estimate, currency }: { estimate: CustomerEstimateDetailDTO; currency: CurrencyCode }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-xl">{estimate.number} · {estimate.jobTitle}</CardTitle>
            <CardDescription>Created {dateLabel(estimate.createdAt)} · Expires {dateLabel(estimate.expiresAt)}</CardDescription>
          </div>
          <StatusPill status={estimate.status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <div><p className="text-xs font-bold uppercase text-fg-dim">Total</p><p className="text-lg font-black">{money(estimate.total, currency)}</p></div>
          <div><p className="text-xs font-bold uppercase text-fg-dim">Accepted</p><p className="text-sm">{dateLabel(estimate.acceptedAt, true)}</p></div>
          <div><p className="text-xs font-bold uppercase text-fg-dim">Selected option</p><p className="text-sm">{estimate.selectedOptionLabel ?? "—"}</p></div>
        </div>
        {estimate.scope ? <div><p className="text-xs font-bold uppercase text-fg-dim">Scope</p><p className="mt-1 text-sm text-fg-muted">{estimate.scope}</p></div> : null}
        {estimate.recommendations ? <div><p className="text-xs font-bold uppercase text-fg-dim">Recommendations</p><p className="mt-1 text-sm text-fg-muted">{estimate.recommendations}</p></div> : null}
        {estimate.exclusions ? <div><p className="text-xs font-bold uppercase text-fg-dim">Exclusions</p><p className="mt-1 text-sm text-fg-muted">{estimate.exclusions}</p></div> : null}
        <div className="space-y-3">
          {estimate.options.map((option) => (
            <div key={option.id} className="rounded-xl border border-border p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <p className="font-bold text-fg">{option.label}</p>
                  {option.recommended ? <StatusPill status="recommended" /> : null}
                </div>
                <p className="font-black text-fg">{money(option.total, currency)}</p>
              </div>
              <ul className="mt-3 divide-y divide-border text-sm">
                {option.lineItems.map((line) => (
                  <li key={line.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="text-fg-muted">{line.description} × {line.quantity}{line.unit ? ` ${line.unit}` : ""}</span>
                    <span className="font-semibold text-fg">{money(line.unitPrice * line.quantity, currency)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function InvoicesSection({ orgId, currency }: { orgId: string; currency: CurrencyCode }) {
  const [selected, setSelected] = useState<string | null>(null);
  const detail = useResource(
    () => (selected ? customerApi.invoice(orgId, selected) : Promise.resolve(null)),
    [orgId, selected],
  );
  const invoices = useResource(() => customerApi.invoices(orgId), [orgId]);

  if (selected) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>← Back to invoices</Button>
        <SectionState loading={detail.loading} error={detail.error} />
        {detail.data ? <InvoiceDetail invoice={detail.data} currency={currency} /> : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SectionHeader title="Invoices" description="Outstanding balances, receipts and payment history." />
      <SectionState loading={invoices.loading} error={invoices.error} />
      {invoices.data && invoices.data.length === 0 ? <Empty>No invoices yet.</Empty> : null}
      {invoices.data?.map((invoice) => (
        <Card key={invoice.id} className="cursor-pointer hover:border-accent" onClick={() => setSelected(invoice.id)}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <CardTitle>{invoice.number}</CardTitle>
                <StatusPill status={invoice.status} />
              </div>
              <p className="mt-1 text-sm text-fg-muted">{invoice.jobTitle}</p>
              <p className="text-xs text-fg-dim">Due {dateLabel(invoice.dueAt)} · Created {dateLabel(invoice.createdAt)}</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-black text-fg">{money(invoice.remaining, currency)}</p>
              <p className="text-xs text-fg-muted">of {money(invoice.total, currency)}</p>
              <a className="text-xs font-semibold text-accent no-underline" href={customerFileUrl(`/customer-auth/orgs/${orgId}/invoices/${invoice.id}/pdf`)} target="_blank" rel="noreferrer">Download PDF</a>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function InvoiceDetail({ invoice, currency }: { invoice: CustomerInvoiceDetailDTO; currency: CurrencyCode }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-xl">{invoice.number} · {invoice.jobTitle}</CardTitle>
            <CardDescription>Due {dateLabel(invoice.dueAt)} · Created {dateLabel(invoice.createdAt)}</CardDescription>
          </div>
          <StatusPill status={invoice.status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <div><p className="text-xs font-bold uppercase text-fg-dim">Total</p><p className="text-lg font-black">{money(invoice.total, currency)}</p></div>
          <div><p className="text-xs font-bold uppercase text-fg-dim">Paid</p><p className="text-lg font-black">{money(invoice.paid, currency)}</p></div>
          <div><p className="text-xs font-bold uppercase text-fg-dim">Remaining</p><p className="text-lg font-black">{money(invoice.remaining, currency)}</p></div>
        </div>
        <div>
          <p className="mb-2 text-xs font-bold uppercase text-fg-dim">Line items</p>
          <ul className="divide-y divide-border text-sm">
            {invoice.lineItems.map((line) => (
              <li key={line.id} className="flex items-center justify-between gap-3 py-2">
                <span className="text-fg-muted">{line.description} × {line.quantity}{line.unit ? ` ${line.unit}` : ""}</span>
                <span className="font-semibold text-fg">{money(line.unitPrice * line.quantity, currency)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-2 text-xs font-bold uppercase text-fg-dim">Payments</p>
          {invoice.payments.length === 0 ? <Empty>No payments recorded yet.</Empty> : (
            <ul className="divide-y divide-border text-sm">
              {invoice.payments.map((payment) => (
                <li key={payment.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="text-fg-muted">{dateLabel(payment.paidAt, true)} · {payment.method}{payment.reference ? ` · ${payment.reference}` : ""}</span>
                  <span className="font-semibold text-fg">{money(payment.amount, currency)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function JobsSection({ orgId, currency }: { orgId: string; currency: CurrencyCode }) {
  const [selected, setSelected] = useState<string | null>(null);
  const detail = useResource(
    () => (selected ? customerApi.job(orgId, selected) : Promise.resolve(null)),
    [orgId, selected],
  );
  const jobs = useResource(() => customerApi.jobs(orgId), [orgId]);

  if (selected) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>← Back to service history</Button>
        <SectionState loading={detail.loading} error={detail.error} />
        {detail.data ? <JobDetail job={detail.data} orgId={orgId} currency={currency} /> : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SectionHeader title="Service history" description="Every job, its timeline, technician and job photos." />
      <SectionState loading={jobs.loading} error={jobs.error} />
      {jobs.data && jobs.data.length === 0 ? <Empty>No service history yet.</Empty> : null}
      {jobs.data?.map((job) => (
        <Card key={job.id} className="cursor-pointer hover:border-accent" onClick={() => setSelected(job.id)}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2"><CardTitle>{job.title}</CardTitle><StatusPill status={job.status} /></div>
              <p className="mt-1 text-sm text-fg-muted">{job.number ?? "Job"} · {job.serviceCategory ?? "Service"}</p>
              <p className="text-xs text-fg-dim">{job.serviceAddress ?? "Address on file"} · {dateLabel(job.createdAt)}</p>
            </div>
            <p className="font-black text-fg">{money(job.total, currency)}</p>
          </div>
        </Card>
      ))}
    </div>
  );
}

function JobDetail({ job, orgId, currency }: { job: CustomerJobDetailDTO; orgId: string; currency: CurrencyCode }) {
  const [version, setVersion] = useState(0);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const current = useResource(() => customerApi.job(orgId, job.id), [orgId, job.id, version]);
  const data = current.data ?? job;

  async function submitReview(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await customerApi.createReview(orgId, { jobId: data.id, rating, comment: comment.trim() || undefined });
      setMessage("Thank you — your review was submitted.");
      setVersion((value) => value + 1);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to submit review.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-xl">{data.title}</CardTitle>
              <CardDescription>{data.number ?? "Job"} · Created {dateLabel(data.createdAt)}</CardDescription>
            </div>
            <StatusPill status={data.status} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <div><p className="text-xs font-bold uppercase text-fg-dim">Service address</p><p>{data.serviceAddress ?? "—"}</p></div>
            <div><p className="text-xs font-bold uppercase text-fg-dim">Technician</p><p>{data.technicianName ?? "Assigned by dispatch"}</p></div>
            <div><p className="text-xs font-bold uppercase text-fg-dim">Scheduled</p><p>{dateLabel(data.appointment?.startsAt ?? data.scheduledAt, true)}</p></div>
            <div><p className="text-xs font-bold uppercase text-fg-dim">Total</p><p className="font-bold">{money(data.total, currency)}</p></div>
          </div>
          {data.description ? <div><p className="text-xs font-bold uppercase text-fg-dim">Description</p><p className="mt-1 text-sm text-fg-muted">{data.description}</p></div> : null}
          {data.timeline.length ? (
            <div>
              <p className="mb-2 text-xs font-bold uppercase text-fg-dim">Timeline</p>
              <ol className="space-y-2 border-l border-border pl-4 text-sm">
                {data.timeline.map((entry, index) => (
                  <li key={`${entry.status}-${index}`}>
                    <p className="font-semibold text-fg">{entry.status.replaceAll("_", " ")}</p>
                    <p className="text-xs text-fg-dim">{dateLabel(entry.changedAt, true)}{entry.reason ? ` · ${entry.reason}` : ""}</p>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
          {data.lineItems.length ? (
            <div>
              <p className="mb-2 text-xs font-bold uppercase text-fg-dim">Work and parts</p>
              <ul className="divide-y divide-border text-sm">
                {data.lineItems.map((line) => (
                  <li key={line.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="text-fg-muted">{line.description} × {line.quantity}</span>
                    <span className="font-semibold">{money(line.unitPrice * line.quantity, currency)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {data.equipment.length ? (
            <div>
              <p className="mb-2 text-xs font-bold uppercase text-fg-dim">Equipment on site</p>
              <div className="flex flex-wrap gap-2">
                {data.equipment.map((item) => (
                  <span key={item.id} className="rounded-full bg-surface-200 px-3 py-1 text-xs font-semibold text-fg-muted">
                    {item.type}{item.make ? ` · ${item.make}` : ""}{item.model ? ` ${item.model}` : ""}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {data.photos.length ? (
        <Card>
          <CardHeader><CardTitle>Job photos</CardTitle><CardDescription>Photos captured during the visit.</CardDescription></CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.photos.map((photo) => (
                <a key={photo.id} href={customerFileUrl(photo.fileUrl)} target="_blank" rel="noreferrer" className="overflow-hidden rounded-xl border border-border no-underline">
                  <img src={customerFileUrl(photo.fileUrl)} alt={photo.fileName ?? photo.category} className="h-40 w-full object-cover" />
                  <p className="px-3 py-2 text-xs font-semibold text-fg-muted">{photo.fileName ?? photo.category}</p>
                </a>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {data.canReview ? (
        <Card>
          <CardHeader><CardTitle>Rate this visit</CardTitle><CardDescription>Your feedback helps the team improve.</CardDescription></CardHeader>
          <CardContent>
            <form onSubmit={submitReview} className="space-y-3">
              <label className="block text-sm font-semibold text-fg">
                Rating
                <select className="mt-1 h-10 w-full rounded-lg border border-border bg-surface-50 px-3 text-sm" value={rating} onChange={(event) => setRating(Number(event.target.value))}>
                  {[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{value} star{value === 1 ? "" : "s"}</option>)}
                </select>
              </label>
              <label className="block text-sm font-semibold text-fg">
                Comment (optional)
                <textarea className="mt-1 min-h-24 w-full rounded-lg border border-border bg-surface-50 px-3 py-2 text-sm" value={comment} onChange={(event) => setComment(event.target.value)} />
              </label>
              {message ? <p className="text-sm text-fg-muted">{message}</p> : null}
              <Button disabled={busy}>{busy ? "Submitting..." : "Submit review"}</Button>
            </form>
          </CardContent>
        </Card>
      ) : data.review ? (
        <Card>
          <CardHeader><CardTitle>Your review</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm font-semibold text-fg">{data.review.rating}/5</p>
            {data.review.comment ? <p className="mt-1 text-sm text-fg-muted">{data.review.comment}</p> : null}
            {data.review.reply ? <p className="mt-2 rounded-lg bg-surface-200 p-3 text-sm text-fg">Team reply: {data.review.reply}</p> : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function EquipmentSection({ orgId, currency }: { orgId: string; currency: CurrencyCode }) {
  void currency;
  const equipment = useResource(() => customerApi.equipment(orgId), [orgId]);
  return (
    <div className="space-y-4">
      <SectionHeader title="Equipment" description="Warranty dates, maintenance schedule and service status for your assets." />
      <SectionState loading={equipment.loading} error={equipment.error} />
      {equipment.data && equipment.data.length === 0 ? <Empty>No equipment on file yet.</Empty> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        {equipment.data?.map((item) => (
          <Card key={item.id}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle>{item.type}</CardTitle>
                <CardDescription>{[item.make, item.model].filter(Boolean).join(" ") || "Model not recorded"}</CardDescription>
              </div>
              <StatusPill status={item.status} />
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-xs font-bold uppercase text-fg-dim">Serial</dt><dd>{item.serialNumber ?? "—"}</dd></div>
              <div><dt className="text-xs font-bold uppercase text-fg-dim">Asset tag</dt><dd>{item.assetTag ?? "—"}</dd></div>
              <div><dt className="text-xs font-bold uppercase text-fg-dim">Capacity</dt><dd>{item.capacity ?? "—"}</dd></div>
              <div><dt className="text-xs font-bold uppercase text-fg-dim">Warranty</dt><dd>{dateLabel(item.warrantyExpiry)}</dd></div>
              <div><dt className="text-xs font-bold uppercase text-fg-dim">Last service</dt><dd>{dateLabel(item.lastMaintenance)}</dd></div>
              <div><dt className="text-xs font-bold uppercase text-fg-dim">Next service</dt><dd>{dateLabel(item.nextMaintenance)}</dd></div>
            </dl>
            <p className="mt-3 text-xs text-fg-muted">{item.propertyAddress ?? "No property linked"}</p>
            {item.notes ? <p className="mt-2 text-xs text-fg-dim">{item.notes}</p> : null}
          </Card>
        ))}
      </div>
    </div>
  );
}

function PropertiesSection({ orgId }: { orgId: string }) {
  const [version, setVersion] = useState(0);
  const properties = useResource(() => customerApi.properties(orgId), [orgId, version]);
  const [address, setAddress] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function addProperty(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await customerApi.addProperty(orgId, { address });
      setAddress("");
      setVersion((value) => value + 1);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to add property.");
    } finally {
      setBusy(false);
    }
  }

  async function removeProperty(property: CustomerPropertyDTO) {
    if (!window.confirm(`Remove ${property.address}?`)) return;
    try {
      await customerApi.deleteProperty(orgId, property.id);
      setVersion((value) => value + 1);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to remove property.");
    }
  }

  return (
    <div className="space-y-4">
      <SectionHeader title="Properties" description="Keep your service addresses and equipment locations current." />
      <Card>
        <CardHeader><CardTitle>Add a property</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={addProperty} className="flex flex-col gap-2 sm:flex-row">
            <Input placeholder="Street, city" required value={address} onChange={(event) => setAddress(event.target.value)} />
            <Button disabled={busy}>{busy ? "Adding..." : "Add property"}</Button>
          </form>
          {message ? <p className="mt-2 text-sm text-red">{message}</p> : null}
        </CardContent>
      </Card>
      <SectionState loading={properties.loading} error={properties.error} />
      {properties.data && properties.data.length === 0 ? <Empty>No properties on file yet.</Empty> : null}
      {properties.data?.map((property) => (
        <Card key={property.id}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>{property.address}</CardTitle>
              <p className="mt-1 text-sm text-fg-muted">{property.equipmentCount} equipment · {property.jobCount} job(s)</p>
              <p className="text-xs text-fg-dim">Added {dateLabel(property.createdAt)}</p>
            </div>
            <Button variant="danger" size="sm" onClick={() => void removeProperty(property)}>Remove</Button>
          </div>
        </Card>
      ))}
    </div>
  );
}

function DocumentsSection({ orgId }: { orgId: string }) {
  const documents = useResource(() => customerApi.documents(orgId), [orgId]);
  return (
    <div className="space-y-4">
      <SectionHeader title="Documents" description="Estimates, invoices and job photos in one library." />
      <SectionState loading={documents.loading} error={documents.error} />
      {documents.data && documents.data.length === 0 ? <Empty>No documents yet.</Empty> : null}
      <Card>
        <CardContent className="pt-1">
          <ul className="divide-y divide-border">
            {documents.data?.map((document) => (
              <li key={document.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <div>
                  <p className="font-semibold text-fg">{document.title}</p>
                  <p className="text-xs text-fg-muted">{document.kind} · {dateLabel(document.createdAt)}{document.sizeBytes ? ` · ${Math.round(document.sizeBytes / 1024)} KB` : ""}</p>
                </div>
                <a className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-fg no-underline hover:bg-surface-200" href={customerFileUrl(document.downloadUrl)} target="_blank" rel="noreferrer">
                  Download
                </a>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function PlansSection({ orgId, currency }: { orgId: string; currency: CurrencyCode }) {
  const [version, setVersion] = useState(0);
  const plans = useResource(() => customerApi.plans(orgId), [orgId, version]);
  const [open, setOpen] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function renew(plan: CustomerServicePlanDetailDTO) {
    try {
      await customerApi.requestRenewal(orgId, plan.id);
      setMessage(`Renewal request sent for ${plan.planName}.`);
      setVersion((value) => value + 1);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to request renewal.");
    }
  }

  return (
    <div className="space-y-4">
      <SectionHeader title="Service plans" description="Visit allowances, renewal windows and completed maintenance." />
      {message ? <p className="rounded-lg bg-surface-200 px-4 py-3 text-sm text-fg">{message}</p> : null}
      <SectionState loading={plans.loading} error={plans.error} />
      {plans.data && plans.data.length === 0 ? <Empty>No service plans yet.</Empty> : null}
      {plans.data?.map((plan) => (
        <Card key={plan.id}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2"><CardTitle>{plan.planName}</CardTitle><StatusPill status={plan.status} /></div>
              <p className="mt-1 text-sm text-fg-muted">{plan.agreementNumber} · {plan.visitsCompleted}/{plan.visitsIncluded} visits used</p>
              <p className="text-xs text-fg-dim">{dateLabel(plan.startsAt)} → {plan.endsAt ? dateLabel(plan.endsAt) : "open-ended"} · {money(plan.priceCents, currency)} / {plan.billingFrequency}</p>
              {plan.nextVisit ? <p className="mt-1 text-xs text-fg-muted">Next: {plan.nextVisit.title} · {dateLabel(plan.nextVisit.dueAt ?? plan.nextVisit.scheduledAt)}</p> : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setOpen(open === plan.id ? null : plan.id)}>{open === plan.id ? "Hide visits" : "View visits"}</Button>
              {plan.renewalRequestPending ? <StatusPill status="renewal requested" /> : <Button size="sm" onClick={() => void renew(plan)}>Request renewal</Button>}
            </div>
          </div>
          {open === plan.id ? (
            <div className="mt-4">
              {plan.visits.length === 0 ? <Empty>No visits recorded yet.</Empty> : (
                <ul className="divide-y divide-border text-sm">
                  {plan.visits.map((visit) => (
                    <li key={visit.id} className="py-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-fg">{visit.title}</p>
                        <StatusPill status={visit.status} />
                      </div>
                      <p className="text-xs text-fg-muted">{visit.visitType} · Due {dateLabel(visit.dueAt ?? visit.scheduledAt)} · Completed {dateLabel(visit.completedAt)}</p>
                      {visit.workPerformed ? <p className="mt-1 text-xs text-fg-muted">Work: {visit.workPerformed}</p> : null}
                      {visit.problemsFound.length ? <p className="text-xs text-fg-muted">Found: {visit.problemsFound.join(", ")}</p> : null}
                      {visit.recommendations ? <p className="text-xs text-fg-muted">Recommendations: {visit.recommendations}</p> : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </Card>
      ))}
    </div>
  );
}

function ReviewsSection({ orgId, currency }: { orgId: string; currency: CurrencyCode }) {
  void currency;
  const [version, setVersion] = useState(0);
  const reviews = useResource(() => customerApi.reviews(orgId), [orgId, version]);
  const jobs = useResource(() => customerApi.jobs(orgId), [orgId, version]);
  const [jobId, setJobId] = useState("");
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const reviewedIds = useMemo(() => new Set(reviews.data?.map((review) => review.jobId) ?? []), [reviews.data]);
  const reviewable = jobs.data?.filter((job) => job.status === "completed" && !reviewedIds.has(job.id)) ?? [];

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!jobId) return;
    setBusy(true);
    setMessage(null);
    try {
      await customerApi.createReview(orgId, { jobId, rating, comment: comment.trim() || undefined });
      setMessage("Review submitted. Thank you!");
      setJobId("");
      setComment("");
      setVersion((value) => value + 1);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to submit review.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <SectionHeader title="Reviews" description="Share feedback on completed visits and revisit past reviews." />
      {reviewable.length ? (
        <Card>
          <CardHeader><CardTitle>Leave a review</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-3">
              <label className="block text-sm font-semibold text-fg">
                Job
                <select className="mt-1 h-10 w-full rounded-lg border border-border bg-surface-50 px-3 text-sm" required value={jobId} onChange={(event) => setJobId(event.target.value)}>
                  <option value="">Choose a completed job</option>
                  {reviewable.map((job) => <option key={job.id} value={job.id}>{job.title} · {job.number ?? dateLabel(job.createdAt)}</option>)}
                </select>
              </label>
              <label className="block text-sm font-semibold text-fg">
                Rating
                <select className="mt-1 h-10 w-full rounded-lg border border-border bg-surface-50 px-3 text-sm" value={rating} onChange={(event) => setRating(Number(event.target.value))}>
                  {[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{value} star{value === 1 ? "" : "s"}</option>)}
                </select>
              </label>
              <label className="block text-sm font-semibold text-fg">
                Comment (optional)
                <textarea className="mt-1 min-h-24 w-full rounded-lg border border-border bg-surface-50 px-3 py-2 text-sm" value={comment} onChange={(event) => setComment(event.target.value)} />
              </label>
              {message ? <p className="text-sm text-fg-muted">{message}</p> : null}
              <Button disabled={busy || !jobId}>{busy ? "Submitting..." : "Submit review"}</Button>
            </form>
          </CardContent>
        </Card>
      ) : null}
      <SectionState loading={reviews.loading} error={reviews.error} />
      {reviews.data && reviews.data.length === 0 ? <Empty>No reviews yet.</Empty> : null}
      {reviews.data?.map((review) => (
        <Card key={review.id}>
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle>{review.jobTitle ?? "Service visit"}</CardTitle>
              <CardDescription>{dateLabel(review.createdAt)}</CardDescription>
            </div>
            <p className="text-sm font-black text-fg">{review.rating}/5</p>
          </div>
          {review.comment ? <p className="mt-3 text-sm text-fg-muted">{review.comment}</p> : null}
          {review.reply ? <p className="mt-3 rounded-lg bg-surface-200 p-3 text-sm text-fg">Team reply: {review.reply}</p> : null}
        </Card>
      ))}
    </div>
  );
}

function NotificationsSection({ orgId, onRead }: { orgId: string; onRead: () => void }) {
  const [version, setVersion] = useState(0);
  const notifications = useResource(() => customerApi.notifications(orgId), [orgId, version]);
  const [busy, setBusy] = useState(false);

  async function markAllRead() {
    setBusy(true);
    try {
      await customerApi.markNotificationsRead(orgId);
      setVersion((value) => value + 1);
      onRead();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionHeader title="Notifications" description="Estimates, invoices, appointments, plan visits and replies." />
        <Button variant="outline" size="sm" disabled={busy} onClick={() => void markAllRead()}>Mark all read</Button>
      </div>
      <SectionState loading={notifications.loading} error={notifications.error} />
      {notifications.data && notifications.data.length === 0 ? <Empty>No notifications yet.</Empty> : null}
      {notifications.data?.map((item) => (
        <Card key={item.id} className={item.read ? "" : "border-accent/40"}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <CardTitle>{item.title}</CardTitle>
                {!item.read ? <span className="h-2 w-2 rounded-full bg-red" /> : null}
              </div>
              {item.body ? <p className="mt-1 text-sm text-fg-muted">{item.body}</p> : null}
              <p className="mt-1 text-xs text-fg-dim">{dateLabel(item.createdAt, true)}</p>
            </div>
            {item.link ? <Link href={item.link} className="text-xs font-bold text-accent no-underline">Open</Link> : null}
          </div>
        </Card>
      ))}
    </div>
  );
}

function SupportSection({ orgId }: { orgId: string }) {
  const [version, setVersion] = useState(0);
  const support = useResource(() => customerApi.support(orgId), [orgId, version]);
  const [form, setForm] = useState({ kind: "general", subject: "", message: "" });
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await customerApi.createSupport(orgId, { ...form, kind: form.kind || "general" });
      setForm({ kind: "general", subject: "", message: "" });
      setMessage("Request sent. The team will reply here.");
      setVersion((value) => value + 1);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to send your request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <SectionHeader title="Support" description="Ask a question or raise an issue about any service." />
      <Card>
        <CardHeader><CardTitle>New request</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-3">
            <label className="block text-sm font-semibold text-fg">
              Topic
              <select className="mt-1 h-10 w-full rounded-lg border border-border bg-surface-50 px-3 text-sm" value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value })}>
                <option value="general">General question</option>
                <option value="billing">Billing</option>
                <option value="repair">Repair issue</option>
                <option value="scheduling">Scheduling</option>
                <option value="renewal">Plan renewal</option>
              </select>
            </label>
            <label className="block text-sm font-semibold text-fg">
              Subject
              <Input className="mt-1" required value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} />
            </label>
            <label className="block text-sm font-semibold text-fg">
              Message
              <textarea className="mt-1 min-h-28 w-full rounded-lg border border-border bg-surface-50 px-3 py-2 text-sm" required value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} />
            </label>
            {message ? <p className="text-sm text-fg-muted">{message}</p> : null}
            <Button disabled={busy}>{busy ? "Sending..." : "Send request"}</Button>
          </form>
        </CardContent>
      </Card>
      <SectionState loading={support.loading} error={support.error} />
      {support.data && support.data.length === 0 ? <Empty>No support requests yet.</Empty> : null}
      {support.data?.map((request) => (
        <Card key={request.id}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>{request.subject}</CardTitle>
              <CardDescription>{request.kind} · {dateLabel(request.createdAt, true)}</CardDescription>
            </div>
            <StatusPill status={request.status} />
          </div>
          <p className="mt-3 text-sm text-fg-muted">{request.message}</p>
          {request.response ? <p className="mt-3 rounded-lg bg-surface-200 p-3 text-sm text-fg">Team reply: {request.response}</p> : null}
        </Card>
      ))}
    </div>
  );
}

function ProfileSection({ orgId }: { orgId: string }) {
  const profile = useResource(() => customerApi.profile(orgId), [orgId]);
  const [form, setForm] = useState({ name: "", email: "", phone: "", company: "", address: "" });
  const [password, setPassword] = useState({ currentPassword: "", newPassword: "" });
  const [message, setMessage] = useState<string | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!profile.data) return;
    setForm({
      name: profile.data.account.name,
      email: profile.data.account.email,
      phone: profile.data.account.phone ?? "",
      company: profile.data.customer.company ?? "",
      address: profile.data.customer.address ?? "",
    });
  }, [profile.data]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const updated = await customerApi.updateProfile(orgId, {
        name: form.name,
        email: form.email,
        phone: form.phone.trim() || null,
        company: form.company.trim() || null,
        address: form.address.trim() || null,
      });
      profile.setData(updated);
      setMessage("Profile updated.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to update profile.");
    } finally {
      setBusy(false);
    }
  }

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setPasswordMessage(null);
    try {
      await customerApi.changePassword(orgId, password);
      setPassword({ currentPassword: "", newPassword: "" });
      setPasswordMessage("Password changed. Other sessions were signed out.");
    } catch (err) {
      setPasswordMessage(err instanceof Error ? err.message : "Unable to change password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <SectionHeader title="Profile" description="Keep your contact details current for scheduling and invoices." />
      <SectionState loading={profile.loading} error={profile.error} />
      {profile.data ? (
        <Card>
          <CardHeader><CardTitle>Contact details</CardTitle><CardDescription>{profile.data.org.name}</CardDescription></CardHeader>
          <CardContent>
            <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-semibold text-fg">Name<Input className="mt-1" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
              <label className="block text-sm font-semibold text-fg">Email<Input className="mt-1" type="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
              <label className="block text-sm font-semibold text-fg">Phone<Input className="mt-1" type="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
              <label className="block text-sm font-semibold text-fg">Company<Input className="mt-1" value={form.company} onChange={(event) => setForm({ ...form, company: event.target.value })} /></label>
              <label className="block text-sm font-semibold text-fg sm:col-span-2">Address<Input className="mt-1" value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} /></label>
              <div className="sm:col-span-2">
                {message ? <p className="mb-2 text-sm text-fg-muted">{message}</p> : null}
                <Button disabled={busy}>Save profile</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader><CardTitle>Change password</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={changePassword} className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-semibold text-fg">Current password<Input className="mt-1" type="password" required value={password.currentPassword} onChange={(event) => setPassword({ ...password, currentPassword: event.target.value })} /></label>
            <label className="block text-sm font-semibold text-fg">New password<Input className="mt-1" type="password" required minLength={12} value={password.newPassword} onChange={(event) => setPassword({ ...password, newPassword: event.target.value })} /></label>
            <div className="sm:col-span-2">
              {passwordMessage ? <p className="mb-2 text-sm text-fg-muted">{passwordMessage}</p> : null}
              <Button disabled={busy}>Update password</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function PreferencesSection({ orgId }: { orgId: string }) {
  const preferences = useResource(() => customerApi.preferences(orgId), [orgId]);
  const communications = useResource(() => customerApi.communications(orgId), [orgId]);
  const [form, setForm] = useState<CustomerPreferencesDTO | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setForm(preferences.data);
  }, [preferences.data]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!form) return;
    setBusy(true);
    setMessage(null);
    try {
      const updated = await customerApi.updatePreferences(orgId, {
        emailUpdates: form.emailUpdates,
        smsUpdates: form.smsUpdates,
        marketingOptIn: form.marketingOptIn,
        language: form.language,
      });
      setForm(updated);
      setMessage("Preferences saved.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to save preferences.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <SectionHeader title="Preferences" description="Choose how the team contacts you and review recent messages." />
      <SectionState loading={preferences.loading} error={preferences.error} />
      {form ? (
        <Card>
          <CardHeader><CardTitle>Communication preferences</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={save} className="space-y-3">
              <Toggle label="Email updates" checked={form.emailUpdates} onChange={(checked) => setForm({ ...form, emailUpdates: checked })} />
              <Toggle label="SMS updates" checked={form.smsUpdates} onChange={(checked) => setForm({ ...form, smsUpdates: checked })} />
              <Toggle label="Marketing and offers" checked={form.marketingOptIn} onChange={(checked) => setForm({ ...form, marketingOptIn: checked })} />
              <label className="block text-sm font-semibold text-fg">
                Language
                <select className="mt-1 h-10 w-full rounded-lg border border-border bg-surface-50 px-3 text-sm" value={form.language} onChange={(event) => setForm({ ...form, language: event.target.value })}>
                  <option value="en">English</option>
                  <option value="fr">French</option>
                </select>
              </label>
              {message ? <p className="text-sm text-fg-muted">{message}</p> : null}
              <Button disabled={busy}>Save preferences</Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader><CardTitle>Communication history</CardTitle></CardHeader>
        <CardContent>
          <SectionState loading={communications.loading} error={communications.error} />
          {communications.data && communications.data.length === 0 ? <Empty>No messages sent yet.</Empty> : null}
          <ul className="divide-y divide-border">
            {communications.data?.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <div>
                  <p className="font-semibold text-fg">{item.subject}</p>
                  <p className="text-xs text-fg-muted">{item.kind} · {item.recipient} · {dateLabel(item.sentAt ?? item.createdAt, true)}</p>
                </div>
                <StatusPill status={item.status} />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm font-semibold text-fg">
      {label}
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 accent-accent" />
    </label>
  );
}
