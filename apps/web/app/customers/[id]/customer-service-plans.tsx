"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatMoney, type CustomerServicePlanDTO, type ServicePlanDTO, type ServicePlanVisitDTO } from "@ofp/shared";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = typeof window !== "undefined" ? localStorage.getItem("ofp_token") : null;
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...(init?.headers as Record<string, string>),
  };
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (!res.ok) throw new Error(await res.text());
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

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
        request<ServicePlanDTO[]>("/api/service-plans"),
        request<CustomerServicePlanDTO[]>(`/api/service-plans/enrollments?customerId=${customerId}`),
        request<ServicePlanVisitDTO[]>("/api/service-plans/visits"),
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
      await request<CustomerServicePlanDTO>("/api/service-plans/enrollments", {
        method: "POST",
        body: JSON.stringify({
          customerId,
          servicePlanId: selectedPlanId,
          startsAt: startsAt.toISOString(),
          renewsAt: renewsAt.toISOString(),
          renewalReminderAt: renewalReminderAt.toISOString(),
          visitsIncluded: plan?.includedVisitsPerTerm ?? 2,
        }),
      });
      await load();
    } finally {
      setEnrolling(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Service Plans</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-fg-muted py-6 text-center">Loading service plans...</p>
        ) : error ? (
          <div className="rounded-lg border border-red/30 bg-red/5 p-3">
            <p className="text-sm text-red font-medium">Service plans unavailable</p>
            <p className="mt-1 text-xs text-fg-muted">{error}</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {enrollments.length === 0 ? (
              <div className="rounded-xl border border-border bg-surface-200 p-4">
                <p className="text-sm font-medium text-fg">No active membership on this customer.</p>
                <p className="mt-1 text-xs text-fg-muted">Enroll them in a service plan to track included visits, renewal timing, and priority benefits.</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {enrollments.map((enrollment) => {
                  const plan = planById.get(enrollment.servicePlanId);
                  const rows = visitsByEnrollment.get(enrollment.id) ?? [];
                  const pct = enrollment.visitsIncluded > 0 ? Math.min(100, (enrollment.visitsCompleted / enrollment.visitsIncluded) * 100) : 0;
                  return (
                    <div key={enrollment.id} className="rounded-xl border border-border bg-surface-200 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-fg">{plan?.name ?? "Service plan"}</p>
                          <p className="mt-1 text-xs text-fg-muted">
                            {plan ? `${formatMoney(plan.priceCents)} · ${plan.termMonths} month term` : "Plan details unavailable"}
                          </p>
                        </div>
                        <span className="rounded-full bg-green/10 px-2.5 py-1 text-xs font-semibold text-green capitalize">{enrollment.status}</span>
                      </div>
                      <div className="mt-4">
                        <div className="mb-1 flex justify-between text-xs text-fg-muted">
                          <span>Included visits</span>
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

            <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface-300 p-4 sm:flex-row sm:items-center">
              <select
                value={selectedPlanId}
                onChange={(event) => setSelectedPlanId(event.target.value)}
                className="h-10 flex-1 rounded-lg border border-border bg-surface-200 px-3 text-sm text-fg"
              >
                {plans.length === 0 ? (
                  <option value="">Create a plan first</option>
                ) : (
                  plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)
                )}
              </select>
              <Button size="sm" disabled={!selectedPlanId || enrolling} onClick={enroll}>
                {enrolling ? "Enrolling..." : "Enroll customer"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
