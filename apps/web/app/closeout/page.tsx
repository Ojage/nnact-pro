"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { CustomerDTO, JobDTO } from "@nnact/shared";
import { formatMoney } from "@nnact/shared";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { JobStatusBadge, InvoiceStatusBadge } from "@/components/status-badge";
import { ADVANCE_TAG } from "@nnact/shared";
import { emitWalkthroughDone } from "@/lib/walkthroughs/events";

interface InvoiceRow {
  id: string;
  jobId: string;
  number: string;
  status: "draft" | "sent" | "paid" | "void";
  total: number;
}

type BusyAction = { jobId: string; action: "start" | "complete" | "invoice" } | null;

function customerName(job: JobDTO, customers: Map<string, CustomerDTO>) {
  return customers.get(job.customerId)?.name ?? "Customer unavailable";
}

export default function CloseoutPage() {
  const [jobs, setJobs] = useState<JobDTO[]>([]);
  const [customers, setCustomers] = useState<CustomerDTO[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<BusyAction>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.jobs(), api.customers(), api.invoices()])
      .then(([jobRows, customerRows, invoiceRows]) => {
        if (cancelled) return;
        setJobs(jobRows);
        setCustomers(customerRows);
        setInvoices(invoiceRows);
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const customerMap = useMemo(
    () => new Map(customers.map((customer) => [customer.id, customer])),
    [customers],
  );
  const invoiceMap = useMemo(
    () => new Map(invoices.filter((invoice) => invoice.status !== "void").map((invoice) => [invoice.jobId, invoice])),
    [invoices],
  );

  const scheduled = useMemo(
    () => jobs.filter((job) => job.status === "scheduled"),
    [jobs],
  );
  const inProgress = useMemo(
    () => jobs.filter((job) => job.status === "in_progress"),
    [jobs],
  );
  const readyToInvoice = useMemo(
    () => jobs.filter((job) => job.status === "completed" && job.total > 0 && !invoiceMap.has(job.id)),
    [jobs, invoiceMap],
  );
  const needsPricing = useMemo(
    () => jobs.filter((job) => job.status === "completed" && job.total === 0 && !invoiceMap.has(job.id)),
    [jobs, invoiceMap],
  );
  const recentlyInvoiced = useMemo(
    () => jobs.filter((job) => invoiceMap.has(job.id)).slice(0, 8),
    [jobs, invoiceMap],
  );

  async function updateStatus(job: JobDTO, status: "in_progress" | "completed") {
    setError(null);
    setBusy({ jobId: job.id, action: status === "in_progress" ? "start" : "complete" });
    try {
      const updated = await api.patchJob(job.id, { status });
      if (status === "in_progress") emitWalkthroughDone(ADVANCE_TAG.visitStarted);
      if (status === "completed") emitWalkthroughDone(ADVANCE_TAG.visitCompleted);
      setJobs((rows) => rows.map((row) => (row.id === job.id ? updated : row)));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(null);
    }
  }

  async function createInvoice(job: JobDTO) {
    if (job.total <= 0) {
      setError("Add billable line items before creating an invoice.");
      return;
    }
    setError(null);
    setBusy({ jobId: job.id, action: "invoice" });
    try {
      const invoice = await api.createInvoice({ jobId: job.id });
      setInvoices((rows) => [invoice, ...rows]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div>
        <PageHeader title="Job closeout" description="Move completed field work into billing without losing the handoff." />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-24 rounded-xl" />)}
        </div>
        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <Skeleton className="h-80 rounded-xl" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div data-testid="closeout-board">
      <PageHeader
        title="Job closeout"
        description="Start work, complete the visit, resolve missing pricing, and create the invoice from one operations queue."
        actions={
          <div className="flex gap-2">
            <Link href="/jobs/new"><Button variant="secondary" size="sm">New job</Button></Link>
            <Link href="/invoices"><Button size="sm">Invoices</Button></Link>
          </div>
        }
      />

      {error && (
        <div role="alert" className="mb-5 rounded-xl border border-red/30 bg-red/5 p-4 text-sm text-red">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          ["Awaiting start", scheduled.length, "text-blue"],
          ["In progress", inProgress.length, "text-yellow"],
          ["Ready to invoice", readyToInvoice.length, "text-green"],
          ["Needs pricing", needsPricing.length, needsPricing.length ? "text-red" : "text-green"],
          ["Invoiced", recentlyInvoiced.length, "text-fg"],
        ].map(([label, value, tone]) => (
          <Card key={String(label)}>
            <CardContent className="p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-fg-dim">{label}</p>
              <p className={`mt-1 text-2xl font-bold ${tone}`}>{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <QueueCard title="Awaiting start" description="Scheduled jobs ready for the technician to begin." empty="No scheduled jobs are waiting to start.">
          {scheduled.map((job) => (
            <JobCard key={job.id} job={job} customer={customerName(job, customerMap)}>
              <Button
                size="sm"
                onClick={() => updateStatus(job, "in_progress")}
                disabled={busy?.jobId === job.id}
                aria-label={`Start ${job.title}`}
              >
                {busy?.jobId === job.id ? "Starting…" : "Start job"}
              </Button>
            </JobCard>
          ))}
        </QueueCard>

        <QueueCard title="In progress" description="Active field work that still needs a completion decision." empty="No jobs are currently in progress.">
          {inProgress.map((job) => (
            <JobCard key={job.id} job={job} customer={customerName(job, customerMap)}>
              <Button
                size="sm"
                onClick={() => updateStatus(job, "completed")}
                disabled={busy?.jobId === job.id}
                aria-label={`Complete ${job.title}`}
              >
                {busy?.jobId === job.id ? "Completing…" : "Mark complete"}
              </Button>
            </JobCard>
          ))}
        </QueueCard>

        <QueueCard title="Ready to invoice" description="Completed jobs with billable pricing and no active invoice." empty="No completed jobs are ready for invoicing.">
          {readyToInvoice.map((job) => (
            <JobCard key={job.id} job={job} customer={customerName(job, customerMap)}>
              <Button
                size="sm"
                onClick={() => createInvoice(job)}
                disabled={busy?.jobId === job.id}
                aria-label={`Create invoice for ${job.title}`}
              >
                {busy?.jobId === job.id ? "Creating…" : "Create invoice"}
              </Button>
            </JobCard>
          ))}
        </QueueCard>

        <QueueCard title="Needs pricing" description="Completed jobs that cannot be invoiced because their total is still zero." empty="No completed jobs are missing pricing.">
          {needsPricing.map((job) => (
            <JobCard key={job.id} job={job} customer={customerName(job, customerMap)} tone="warning">
              <Link href={`/jobs/${job.id}`}><Button variant="secondary" size="sm">Add line items</Button></Link>
            </JobCard>
          ))}
        </QueueCard>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Recently invoiced</CardTitle>
          <p className="text-xs text-fg-muted">The latest work orders that have crossed into accounts receivable.</p>
        </CardHeader>
        <CardContent>
          {recentlyInvoiced.length === 0 ? (
            <p className="py-6 text-center text-sm text-fg-muted">No active invoices have been created yet.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {recentlyInvoiced.map((job) => {
                const invoice = invoiceMap.get(job.id)!;
                return (
                  <Link
                    key={job.id}
                    href={`/invoices/${invoice.id}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-200 p-4 no-underline hover:bg-surface-300"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-fg">{job.title}</p>
                      <p className="mt-1 text-xs text-fg-muted">{customerName(job, customerMap)} · {invoice.number}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <InvoiceStatusBadge status={invoice.status} />
                      <p className="mt-1 text-sm font-bold text-fg">{formatMoney(invoice.total)}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function QueueCard({
  title,
  description,
  empty,
  children,
}: {
  title: string;
  description: string;
  empty: string;
  children: React.ReactNode;
}) {
  const rows = Array.isArray(children) ? children.filter(Boolean) : children ? [children] : [];
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>{title}</CardTitle>
            <p className="mt-1 text-xs text-fg-muted">{description}</p>
          </div>
          <span className="rounded-full bg-surface-300 px-2.5 py-1 text-xs font-semibold text-fg-muted">{rows.length}</span>
        </div>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-fg-muted">{empty}</div>
        ) : (
          <div className="space-y-3">{children}</div>
        )}
      </CardContent>
    </Card>
  );
}

function JobCard({
  job,
  customer,
  tone = "default",
  children,
}: {
  job: JobDTO;
  customer: string;
  tone?: "default" | "warning";
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border p-4 ${tone === "warning" ? "border-red/25 bg-red/5" : "border-border bg-surface-200"}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link href={`/jobs/${job.id}`} className="font-semibold text-fg-link">{job.title}</Link>
          <p className="mt-1 text-xs text-fg-muted">{customer}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <JobStatusBadge status={job.status} />
            <span className={`text-sm font-bold ${job.total > 0 ? "text-fg" : "text-red"}`}>{formatMoney(job.total)}</span>
          </div>
        </div>
        <div className="shrink-0">{children}</div>
      </div>
    </div>
  );
}
