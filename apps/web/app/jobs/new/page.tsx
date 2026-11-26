"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CustomerDTO, UserDTO } from "@nnact/shared";
import {
  useCreateAppointmentMutation,
  useCreateCustomerMutation,
  useCreateJobMutation,
  useCustomersQuery,
  useUsersQuery,
} from "@/lib/redux/api";
import { Banner, ConsoleHeader, ConsolePage, Facts, FieldHelp, FormSection, Panel, StickyActionBar } from "@/components/console";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormSelect } from "@/components/ui/form-select";
import { InfoTip } from "@/components/ui/info-tip";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ADVANCE_TAG } from "@nnact/shared";
import { emitWalkthroughDone } from "@/lib/walkthroughs/events";

function localInputValue(date: Date) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

export default function NewJobPage() {
  const router = useRouter();
  const { data: customers = [], isLoading: loading } = useCustomersQuery();
  const { data: users = [] } = useUsersQuery();
  const [createCustomer] = useCreateCustomerMutation();
  const [createJob, { isLoading: saving }] = useCreateJobMutation();
  const [createAppointment] = useCreateAppointmentMutation();
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

  const technicians = useMemo(
    () => users.filter((user) => user.active && ["technician", "owner"].includes(user.role)),
    [users],
  );

  useEffect(() => {
    const date = new Date();
    date.setMinutes(0, 0, 0);
    date.setHours(date.getHours() + 1);
    setStartsAt(localInputValue(date));
  }, []);

  useEffect(() => {
    if (customers.length > 0 && !customerId) setCustomerId(customers[0].id);
  }, [customers, customerId]);

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

    try {
      let resolvedCustomerId = customerId;
      if (customerMode === "new") {
        const customer = await createCustomer({
          name: customerName.trim(),
          email: customerEmail.trim() || undefined,
          phone: customerPhone.trim() || undefined,
        }).unwrap();
        resolvedCustomerId = customer.id;
      }

      // Create the commercial work order as a lead first. The appointment API
      // owns the transition to scheduled so a rejected conflict cannot leave a
      // scheduled job without a calendar visit.
      const job = await createJob({
        customerId: resolvedCustomerId,
        title: title.trim(),
        description: description.trim() || undefined,
      }).unwrap();
      emitWalkthroughDone(ADVANCE_TAG.jobCreated);

      if (scheduleNow) {
        const scheduledAt = new Date(startsAt).toISOString();
        const end = new Date(new Date(scheduledAt).getTime() + Number(durationMinutes) * 60_000);
        await createAppointment({
          jobId: job.id,
          technicianId: technicianId || undefined,
          startsAt: scheduledAt,
          endsAt: end.toISOString(),
        }).unwrap();
      }

      router.push(`/jobs/${job.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  const selectedCustomer = customers.find((customer) => customer.id === customerId);
  const selectedTechnician = technicians.find((technician) => technician.id === technicianId);
  const labelClass = "mb-1.5 block text-sm font-medium text-fg";

  return (
    <ConsolePage className="mx-auto max-w-6xl">
      <ConsoleHeader
        breadcrumb={[{ label: "All jobs", href: "/jobs" }, { label: "New job" }]}
        title="New job"
        description="Create the work order, customer record, and appointment in one intake flow."
      />

      {error && (
        <Banner tone="danger" title={error} />
      )}

      <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]" data-tour="job-form">
        <div className="grid min-w-0 content-start gap-6">
          <FormSection title="Customer" description="Attach this job to an existing customer or create the customer during intake.">
            <div className="inline-flex w-fit rounded-[6px] border border-[var(--shell-border)] p-0.5" role="group" aria-label="Customer type">
              {(["existing", "new"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={customerMode === mode}
                  onClick={() => setCustomerMode(mode)}
                  className={`h-8 rounded-[4px] px-3 text-sm capitalize focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--shell-focus)] ${
                    customerMode === mode ? "bg-[var(--shell-tint)] font-medium text-[var(--shell-accent-text)]" : "text-fg-muted hover:bg-[var(--shell-hover)]"
                  }`}
                >
                  {mode} customer
                </button>
              ))}
            </div>

            {customerMode === "existing" ? (
              <div className="max-w-xl">
                <Label htmlFor="customer" className={labelClass}>Customer</Label>
                <FormSelect
                  id="customer"
                  value={customerId}
                  onChange={setCustomerId}
                  disabled={loading}
                  allowEmpty
                  native
                  placeholder={loading ? "Loading customers…" : "Select a customer"}
                  emptyLabel={loading ? "Loading customers…" : "Select a customer"}
                  options={customers.map((customer) => ({
                    value: customer.id,
                    label: customer.name,
                  }))}
                />
                {!loading && customers.length === 0 ? (
                  <FieldHelp>No customers exist yet. Choose “New customer” to create one.</FieldHelp>
                ) : (
                  <FieldHelp>The job, its invoices and portal links will belong to this customer.</FieldHelp>
                )}
              </div>
            ) : (
              <div className="grid max-w-xl gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label htmlFor="customer-name" className={labelClass}>Customer name</label>
                  <Input id="customer-name" value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Jordan Smith" />
                </div>
                <div>
                  <label htmlFor="customer-phone" className={labelClass}>Phone</label>
                  <Input id="customer-phone" type="tel" value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} placeholder="(555) 555-0199" />
                </div>
                <div>
                  <label htmlFor="customer-email" className={labelClass}>Email</label>
                  <Input id="customer-email" type="email" value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} placeholder="jordan@example.com" />
                </div>
                <p className="text-xs text-fg-muted sm:col-span-2">Phone and email are optional; they let you send SMS and email updates later.</p>
              </div>
            )}
          </FormSection>

          <FormSection title="Work order" description="Capture what the customer needs before assigning or dispatching the visit.">
            <div className="max-w-xl">
              <label htmlFor="job-title" className={labelClass}>Job title</label>
              <Input id="job-title" data-tour="job-form-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Washer leaking during drain" aria-describedby="job-title-help" />
              <FieldHelp id="job-title-help">A short name the team will recognise, such as the appliance and the fault.</FieldHelp>
            </div>
            <div className="max-w-2xl">
              <label htmlFor="job-description" className={labelClass}>Customer complaint and access notes</label>
              <Textarea
                id="job-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={5}
                placeholder="Describe the issue, preferred contact method, parking, gate codes, pets, or other arrival notes."
                className="min-h-32 resize-y"
              />
            </div>
          </FormSection>

          <FormSection title="Schedule and dispatch" description="Leave scheduling off to create an unscheduled lead.">
            <label htmlFor="schedule-now" className="inline-flex w-fit items-center gap-3 text-sm font-medium text-fg">
              <Switch id="schedule-now" checked={scheduleNow} onCheckedChange={setScheduleNow} aria-label="Schedule this job" />
              Book a visit now
            </label>
            {scheduleNow ? (
              <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2 sm:max-w-xs">
                  <label htmlFor="starts-at" className={labelClass}>Start date and time</label>
                  <Input id="starts-at" type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} />
                </div>
                <div>
                  <Label htmlFor="duration" className={labelClass}>Visit length</Label>
                  <FormSelect
                    id="duration"
                    value={durationMinutes}
                    onChange={setDurationMinutes}
                    native
                    options={[
                      { value: "30", label: "30 minutes" },
                      { value: "60", label: "1 hour" },
                      { value: "90", label: "1.5 hours" },
                      { value: "120", label: "2 hours" },
                      { value: "180", label: "3 hours" },
                    ]}
                  />
                  <p className="mt-1.5 flex items-center gap-1.5 text-xs text-fg-muted">
                    <InfoTip label="About visit length">How long the technician is booked out for. Used to detect scheduling conflicts with other jobs.</InfoTip>
                    Blocks the technician for this long so the dispatcher can spot overlaps.
                  </p>
                </div>
                <div>
                  <Label htmlFor="technician" className={labelClass}>Technician</Label>
                  <FormSelect
                    id="technician"
                    value={technicianId}
                    onChange={setTechnicianId}
                    allowEmpty
                    native
                    placeholder="Unassigned"
                    emptyLabel="Unassigned"
                    options={technicians.map((technician) => ({
                      value: technician.id,
                      label: technician.name,
                    }))}
                  />
                  <p className="mt-1.5 flex items-center gap-1.5 text-xs text-fg-muted">
                    <InfoTip label="About assigning a technician">Leaving this unassigned keeps the job unassigned; you can pick a technician later from the dispatch board.</InfoTip>
                    Optional — pick now or assign later from the dispatch board.
                  </p>
                </div>
              </div>
            ) : (
              <p className="max-w-2xl rounded-[8px] border border-dashed border-[var(--shell-border)] p-4 text-sm text-fg-muted">
                The job will enter the pipeline as an unscheduled lead and can be dispatched later.
              </p>
            )}
          </FormSection>
        </div>

        <aside className="min-w-0 lg:sticky lg:top-0 lg:self-start" aria-label="Summary">
          <Panel title="Summary">
            <Facts
              termWidth="6.5rem"
              rows={[
                ["Customer", customerMode === "new" ? (customerName.trim() ? `${customerName.trim()} (new)` : "New customer") : selectedCustomer?.name ?? "Not chosen"],
                ["Job", title.trim() || "Untitled"],
                ["Visit", scheduleNow ? (startsAt ? new Date(startsAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "Pick a time") : "Unscheduled lead"],
                ["Technician", scheduleNow ? selectedTechnician?.name ?? "Unassigned" : "—"],
              ]}
            />
            <div className="mt-4 border-t border-[var(--shell-border)] pt-3">
              <p className="text-sm font-medium text-fg">What happens next</p>
              <p className="mt-1 text-xs leading-5 text-fg-muted">
                NNACT Pro creates the customer when needed, creates the work order, adds the appointment when scheduled, and opens the job detail for estimates, notes, photos, invoices, and payment.
              </p>
            </div>
          </Panel>
        </aside>

        <StickyActionBar className="lg:col-span-2">
          <Button type="submit" data-tour="job-form-submit" loading={saving} disabled={!title.trim()}>
            {scheduleNow ? "Create and schedule job" : "Create unscheduled job"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => router.back()} disabled={saving}>
            Cancel
          </Button>
        </StickyActionBar>
      </form>
    </ConsolePage>
  );
}
