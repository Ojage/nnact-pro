"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FormSelect } from "@/components/ui/form-select";
import { InfoTip } from "@/components/ui/info-tip";
import { api } from "@/lib/api";
import { formatMoney, type CustomerServicePlanDTO, type ServicePlanDTO, type ServicePlanVisitDTO } from "@nnact/shared";

export function CustomerServicePlans({ customerId }: { customerId: string }) {
  const [plans, setPlans] = useState<ServicePlanDTO[]>([]);
  const [enrollments, setEnrollments] = useState<CustomerServicePlanDTO[]>([]);
  const [visits, setVisits] = useState<ServicePlanVisitDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [enrolling, setEnrolling] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [planRows, enrollmentRows, visitRows] = await Promise.all([
        api.servicePlans(),
        api.servicePlanEnrollments(customerId),
        api.servicePlanVisits(),
      ]);
      setPlans(planRows);
      setEnrollments(enrollmentRows);
      setVisits(visitRows);
      if (!selectedPlanId && planRows[0]) setSelectedPlanId(planRows[0].id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load service plans");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  const planById = useMemo(() => new Map(plans.map((plan) => [plan.id, plan])), [plans]);
  const visitsByEnrollment = useMemo(() => {
    const map = new Map<string, ServicePlanVisitDTO[]>();
    for (const visit of visits) {
      const list = map.get(visit.customerServicePlanId) ?? [];
      list.push(visit);
      map.set(visit.customerServicePlanId, list);
    }
    return map;
  }, [visits]);

  async function enroll() {
    if (!selectedPlanId) return;
    setEnrolling(true);
    try {
      const plan = planById.get(selectedPlanId);
      const startsAt = new Date();
      const renewsAt = new Date(startsAt);
      renewsAt.setMonth(renewsAt.getMonth() + (plan?.termMonths ?? 12));
      const renewalReminderAt = new Date(renewsAt);
      renewalReminderAt.setDate(renewalReminderAt.getDate() - 30);
      await api.createServicePlanEnrollment({
        customerId,
        servicePlanId: selectedPlanId,
        startsAt: startsAt.toISOString(),
        renewsAt: renewsAt.toISOString(),
        renewalReminderAt: renewalReminderAt.toISOString(),
        visitsIncluded: plan?.includedVisitsPerTerm ?? 2,
      });
      await load();
    } finally {
      setEnrolling(false);
    }
  }

  const activeEnrollments = enrollments.filter((row) => row.status === "active").length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="inline-flex items-center gap-1.5">
          Service plans
          <InfoTip label="About service plans" side="right">
            Recurring maintenance memberships for this customer — track included visits, renewal dates, and priority scheduling benefits.
          </InfoTip>
        </CardTitle>
        <CardDescription>
          {loading
            ? "Loading memberships…"
            : activeEnrollments === 0
              ? "No active membership on this customer."
              : `${activeEnrollments} active membership${activeEnrollments === 1 ? "" : "s"}.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="py-8 text-center text-sm text-fg-muted">Loading service plans…</p>
        ) : error ? (
          <div className="rounded-lg border border-red/30 bg-red/5 px-4 py-3">
            <p className="text-sm font-medium text-red">Service plans unavailable</p>
            <p className="mt-1 text-xs text-fg-muted">{error}</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {enrollments.length === 0 ? (
              <div className="rounded-xl border border-border bg-surface-200 px-5 py-5">
                <p className="text-sm font-medium text-fg">No active membership on this customer</p>
                <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">
                  Enroll them in a plan to track included visits, renewal timing, and priority benefits.
                </p>
                {plans.length === 0 ? (
                  <Link href="/service-plans" className="mt-3 inline-block text-sm font-medium text-accent hover:underline">
                    Create a service plan first →
                  </Link>
                ) : null}
              </div>
            ) : (
              <div className="grid gap-3">
                {enrollments.map((enrollment) => {
                  const plan = planById.get(enrollment.servicePlanId);
                  const rows = visitsByEnrollment.get(enrollment.id) ?? [];
                  const pct = enrollment.visitsIncluded > 0 ? Math.min(100, (enrollment.visitsCompleted / enrollment.visitsIncluded) * 100) : 0;
                  return (
                    <div key={enrollment.id} className="rounded-xl border border-border bg-surface-200 px-5 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-fg">{plan?.name ?? "Service plan"}</p>
                          <p className="mt-1 text-xs text-fg-muted">
                            {plan ? `${formatMoney(plan.priceCents)} · ${plan.termMonths} month term` : "Plan details unavailable"}
                          </p>
                        </div>
                        <span className="rounded-full bg-green/10 px-2.5 py-1 text-xs font-semibold capitalize text-green">{enrollment.status}</span>
                      </div>
                      <div className="mt-4">
                        <div className="mb-1 flex justify-between text-xs text-fg-muted">
                          <span className="inline-flex items-center gap-1">
                            Included visits
                            <InfoTip label="About included visits" side="top">
                              Visits covered by this membership during the current term. Extra visits can be billed separately.
                            </InfoTip>
                          </span>
                          <span>{enrollment.visitsCompleted} / {enrollment.visitsIncluded}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-surface-400">
                          <div className="h-full rounded-full bg-green" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                      <div className="mt-3 grid gap-2 text-xs text-fg-muted sm:grid-cols-2">
                        <div>Renews: {enrollment.renewsAt ? new Date(enrollment.renewsAt).toLocaleDateString() : "—"}</div>
                        <div>Reminder: {enrollment.renewalReminderAt ? new Date(enrollment.renewalReminderAt).toLocaleDateString() : "—"}</div>
                        <div className="sm:col-span-2">Visits tracked: {rows.length}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="rounded-xl border border-border bg-surface-300 px-4 py-4">
              <p className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-fg-dim">
                Enroll in a plan
                <InfoTip label="About enrollment" side="right">
                  Adds this customer to the selected plan with included visits and renewal dates calculated from the plan term.
                </InfoTip>
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <FormSelect
                  value={selectedPlanId}
                  onChange={setSelectedPlanId}
                  className="flex-1"
                  allowEmpty={plans.length === 0}
                  placeholder="Create a plan first"
                  emptyLabel="Create a plan first"
                  options={plans.map((plan) => ({ value: plan.id, label: plan.name }))}
                />
                <Button size="sm" disabled={!selectedPlanId || enrolling} onClick={enroll}>
                  {enrolling ? "Enrolling…" : "Enroll customer"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
