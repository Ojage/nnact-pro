"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { CustomerDTO, JobDTO, UserDTO } from "@nnact/shared";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

function localInputValue(date: Date) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

async function createJob(body: {
  customerId: string;
  title: string;
  description?: string;
  status: "lead";
}) {
  const token = localStorage.getItem("NNPtoken");
  const response = await fetch(`${BASE}/api/jobs`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "Unable to create job");
    throw new Error(message || "Unable to create job");
  }

  return response.json() as Promise<JobDTO>;
}

export default function NewJobPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<CustomerDTO[]>([]);
  const [technicians, setTechnicians] = useState<UserDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [customerMode, setCustomerMode] = useState<"existing" | "new">("existing");
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [scheduleNow, setScheduleNow] = useState(true);
  const [startsAt, setStartsAt] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("90");
  const [technicianId, setTechnicianId] = useState("");

  useEffect(() => {
    const date = new Date();
    date.setMinutes(0, 0, 0);
    date.setHours(date.getHours() + 1);
    setStartsAt(localInputValue(date));
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.customers(), api.users()])
      .then(([customerRows, userRows]) => {
        if (cancelled) return;
        setCustomers(customerRows);
        setTechnicians(userRows.filter((user) => user.active && ["technician", "owner"].includes(user.role)));
        setCustomerId(customerRows[0]?.id ?? "");
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

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError("Enter a job title before continuing.");
      return;
    }
    if (customerMode === "existing" && !customerId) {
      setError("Select a customer or create a new one.");
      return;
    }
    if (customerMode === "new" && !customerName.trim()) {
      setError("Enter the new customer’s name.");
      return;
    }
    if (scheduleNow && !startsAt) {
      setError("Choose a start date and time.");
      return;
    }

    setSaving(true);
    try {
      let resolvedCustomerId = customerId;
      if (customerMode === "new") {
        const customer = await api.createCustomer({
          name: customerName.trim(),
          email: customerEmail.trim() || undefined,
          phone: customerPhone.trim() || undefined,
        });
        resolvedCustomerId = customer.id;
      }

      // Create the commercial work order as a lead first. The appointment API
      // owns the transition to scheduled so a rejected conflict cannot leave a
      // scheduled job without a calendar visit.
      const job = await createJob({
        customerId: resolvedCustomerId,
        title: title.trim(),
        description: description.trim() || undefined,
        status: "lead",
      });

      if (scheduleNow) {
        const scheduledAt = new Date(startsAt).toISOString();
        const end = new Date(new Date(scheduledAt).getTime() + Number(durationMinutes) * 60_000);
        await api.createAppointment({
          jobId: job.id,
          technicianId: technicianId || undefined,
          startsAt: scheduledAt,
          endsAt: end.toISOString(),
        });
      }

      router.push(`/jobs/${job.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="New job"
        description="Create the work order, customer record, and appointment in one intake flow."
      />

      {error && (
        <div role="alert" className="mb-5 rounded-xl border border-red/30 bg-red/5 p-4 text-sm text-red">
          {error}
        </div>
      )}

      <form onSubmit={submit} className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Customer</CardTitle>
              <p className="text-xs text-fg-muted">Attach this job to an existing customer or create the customer during intake.</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-surface-100 p-1">
                {(["existing", "new"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setCustomerMode(mode)}
                    className={`rounded-lg px-3 py-2 text-sm font-semibold capitalize ${
                      customerMode === mode ? "bg-accent text-white" : "text-fg-muted hover:text-fg"
                    }`}
                  >
                    {mode} customer
                  </button>
                ))}
              </div>

              {customerMode === "existing" ? (
                <div>
                  <label htmlFor="customer" className="mb-1.5 block text-xs font-semibold text-fg-muted">Customer</label>
                  <select
                    id="customer"
                    value={customerId}
                    onChange={(event) => setCustomerId(event.target.value)}
                    disabled={loading}
                    className="h-11 w-full rounded-lg border border-border bg-surface-200 px-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                  >
                    <option value="">{loading ? "Loading customers…" : "Select a customer"}</option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>{customer.name}</option>
                    ))}
                  </select>
                  {!loading && customers.length === 0 && (
                    <p className="mt-2 text-xs text-yellow">No customers exist yet. Choose “New customer” to create one.</p>
                  )}
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label htmlFor="customer-name" className="mb-1.5 block text-xs font-semibold text-fg-muted">Customer name</label>
                    <Input id="customer-name" value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Jordan Smith" />
                  </div>
                  <div>
                    <label htmlFor="customer-phone" className="mb-1.5 block text-xs font-semibold text-fg-muted">Phone</label>
                    <Input id="customer-phone" value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} placeholder="(555) 555-0199" />
                  </div>
                  <div>
                    <label htmlFor="customer-email" className="mb-1.5 block text-xs font-semibold text-fg-muted">Email</label>
                    <Input id="customer-email" type="email" value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} placeholder="jordan@example.com" />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Work order</CardTitle>
              <p className="text-xs text-fg-muted">Capture what the customer needs before assigning or dispatching the visit.</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label htmlFor="job-title" className="mb-1.5 block text-xs font-semibold text-fg-muted">Job title</label>
                <Input id="job-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Washer leaking during drain" />
              </div>
              <div>
                <label htmlFor="job-description" className="mb-1.5 block text-xs font-semibold text-fg-muted">Customer complaint and access notes</label>
                <textarea
                  id="job-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={5}
                  placeholder="Describe the issue, preferred contact method, parking, gate codes, pets, or other arrival notes."
                  className="w-full resize-y rounded-lg border border-border bg-surface-200 px-3 py-2 text-sm text-fg placeholder:text-fg-dim focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle>Schedule and dispatch</CardTitle>
                  <p className="mt-1 text-xs text-fg-muted">Leave scheduling off to create an unscheduled lead.</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={scheduleNow}
                  aria-label="Schedule this job"
                  onClick={() => setScheduleNow((value) => !value)}
                  className={`relative h-7 w-12 rounded-full transition-colors ${scheduleNow ? "bg-accent" : "bg-surface-400"}`}
                >
                  <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-transform ${scheduleNow ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {scheduleNow ? (
                <>
                  <div>
                    <label htmlFor="starts-at" className="mb-1.5 block text-xs font-semibold text-fg-muted">Start date and time</label>
                    <Input id="starts-at" type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                    <div>
                      <label htmlFor="duration" className="mb-1.5 block text-xs font-semibold text-fg-muted">Visit length</label>
                      <select id="duration" value={durationMinutes} onChange={(event) => setDurationMinutes(event.target.value)} className="h-11 w-full rounded-lg border border-border bg-surface-200 px-3 text-sm text-fg">
                        <option value="30">30 minutes</option>
                        <option value="60">1 hour</option>
                        <option value="90">1.5 hours</option>
                        <option value="120">2 hours</option>
                        <option value="180">3 hours</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="technician" className="mb-1.5 block text-xs font-semibold text-fg-muted">Technician</label>
                      <select id="technician" value={technicianId} onChange={(event) => setTechnicianId(event.target.value)} className="h-11 w-full rounded-lg border border-border bg-surface-200 px-3 text-sm text-fg">
                        <option value="">Unassigned</option>
                        {technicians.map((technician) => (
                          <option key={technician.id} value={technician.id}>{technician.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </>
              ) : (
                <div className="rounded-xl border border-dashed border-border p-5 text-sm text-fg-muted">
                  The job will enter the pipeline as an unscheduled lead and can be dispatched later.
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-accent/25 bg-accent/5">
            <CardContent className="space-y-3 pt-5">
              <p className="text-sm font-semibold text-fg">What happens next</p>
              <p className="text-xs leading-5 text-fg-muted">
                NNACT Pro creates the customer when needed, creates the work order, adds the appointment when scheduled, and opens the job detail for estimates, notes, photos, invoices, and payment.
              </p>
              <Button type="submit" className="w-full" disabled={saving || loading}>
                {saving ? "Creating job…" : scheduleNow ? "Create and schedule job" : "Create unscheduled job"}
              </Button>
              <Button type="button" variant="secondary" className="w-full" onClick={() => router.back()} disabled={saving}>
                Cancel
              </Button>
            </CardContent>
          </Card>
        </div>
      </form>
    </div>
  );
}
