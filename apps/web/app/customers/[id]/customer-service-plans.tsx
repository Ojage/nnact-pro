"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FormSelect } from "@/components/ui/form-select";
import { InfoTip } from "@/components/ui/info-tip";
import { api } from "@/lib/api";
import {
  formatMoney,
  type ServicePlanDTO,
  type ServiceAgreementDTO,
  type ServiceVisitDTO,
} from "@nnact/shared";

function agreementStatusColor(status: ServiceAgreementDTO["status"]): string {
  switch (status) {
    case "active":
      return "bg-green/10 text-green";
    case "pending_approval":
      return "bg-amber/10 text-amber";
    case "suspended":
    case "expired":
      return "bg-orange/10 text-orange";
    case "canceled":
      return "bg-red/10 text-red";
    case "renewed":
      return "bg-blue/10 text-blue";
    default:
      return "bg-surface-400/60 text-fg-dim";
  }
}

export function CustomerServicePlans({ customerId }: { customerId: string }) {
  const [plans, setPlans] = useState<ServicePlanDTO[]>([]);
  const [agreements, setAgreements] = useState<ServiceAgreementDTO[]>([]);
  const [visitsByAgreement, setVisitsByAgreement] = useState<Record<string, ServiceVisitDTO[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [enrolling, setEnrolling] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [planRows, agreementRows] = await Promise.all([
        api.servicePlans(),
        api.serviceAgreements(customerId),
      ]);
      setPlans(planRows.filter((p) => p.status !== "archived"));
      setAgreements(agreementRows);
      if (!selectedPlanId && planRows[0]) setSelectedPlanId(planRows[0].id);

      const visitMap: Record<string, ServiceVisitDTO[]> = {};
      await Promise.all(
        agreementRows.map(async (agreement) => {
          visitMap[agreement.id] = await api.agreementVisits(agreement.id);
        }),
      );
      setVisitsByAgreement(visitMap);
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

  async function enroll() {
    if (!selectedPlanId) return;
    setEnrolling(true);
    try {
      const plan = planById.get(selectedPlanId);
      await api.createServiceAgreement({
        customerId,
        planId: selectedPlanId,
        startsAt: new Date().toISOString(),
        visitsIncluded: plan?.visitsPerTerm ?? 0,
        status: "active",
        notes: "Enrolled from customer page",
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to enroll customer");
    } finally {
      setEnrolling(false);
    }
  }

  const activeAgreements = agreements.filter((row) => row.status === "active").length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="inline-flex items-center gap-1.5">
          Service agreements
          <InfoTip label="About service agreements" side="right">
            Recurring maintenance memberships for this customer — track covered assets, scheduled visits, renewal
            dates, and priority scheduling benefits.
          </InfoTip>
        </CardTitle>
        <CardDescription>
          {loading
            ? "Loading agreements…"
            : activeAgreements === 0
              ? "No active agreement on this customer."
              : `${activeAgreements} active agreement${activeAgreements === 1 ? "" : "s"}.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="py-8 text-center text-sm text-fg-muted">Loading service agreements…</p>
        ) : error ? (
          <div className="rounded-lg border border-red/30 bg-red/5 px-4 py-3">
            <p className="text-sm font-medium text-red">Service agreements unavailable</p>
            <p className="mt-1 text-xs text-fg-muted">{error}</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {agreements.length === 0 ? (
              <div className="rounded-xl border border-border bg-surface-200 px-5 py-5">
                <p className="text-sm font-medium text-fg">No service agreement on this customer</p>
                <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">
                  Create an agreement to track included visits, scheduled maintenance, and renewal timing.
                </p>
                {plans.length === 0 ? (
                  <Link href="/service-plans" className="mt-3 inline-block text-sm font-medium text-accent hover:underline">
                    Create a service plan first →
                  </Link>
                ) : null}
              </div>
            ) : (
              <div className="grid gap-3">
                {agreements.map((agreement) => {
                  const plan = agreement.planId ? planById.get(agreement.planId) : undefined;
                  const rows = visitsByAgreement[agreement.id] ?? [];
                  const pct =
                    agreement.visitsIncluded > 0
                      ? Math.min(100, (agreement.visitsCompleted / agreement.visitsIncluded) * 100)
                      : 0;
                  const upcoming = rows
                    .filter((v) => ["scheduled", "confirmed"].includes(v.status))
                    .sort((a, b) => (a.dueAt ?? "").localeCompare(b.dueAt ?? ""))[0];
                  return (
                    <Link
                      key={agreement.id}
                      href={`/agreements/${agreement.id}`}
                      className="block rounded-xl border border-border bg-surface-200 px-5 py-4 transition-colors hover:border-accent/40"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-fg">{agreement.planName}</p>
                          <p className="mt-1 text-xs text-fg-muted">
                            {agreement.agreementNumber}
                            {plan ? ` · ${formatMoney(agreement.priceCents)} · ${plan.termMonths} month term` : ""}
                          </p>
                        </div>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${agreementStatusColor(agreement.status)}`}>
                          {agreement.status.replace("_", " ")}
                        </span>
                      </div>
                      <div className="mt-4">
                        <div className="mb-1 flex justify-between text-xs text-fg-muted">
                          <span className="inline-flex items-center gap-1">
                            Included visits
                            <InfoTip label="About included visits" side="top">
                              Visits covered by this agreement during the current term. Extra visits can be billed
                              separately.
                            </InfoTip>
                          </span>
                          <span>{agreement.visitsCompleted} / {agreement.visitsIncluded}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-surface-400">
                          <div className="h-full rounded-full bg-green" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                      <div className="mt-3 grid gap-2 text-xs text-fg-muted sm:grid-cols-2">
                        <div>
                          Ends: {agreement.endsAt ? new Date(agreement.endsAt).toLocaleDateString() : "—"}
                        </div>
                        <div>
                          Next visit:{" "}
                          {upcoming?.dueAt ? new Date(upcoming.dueAt).toLocaleDateString() : "—"}
                        </div>
                        <div className="sm:col-span-2">Visits tracked: {rows.length}</div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}

            <div className="rounded-xl border border-border bg-surface-300 px-4 py-4">
              <p className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-fg-dim">
                New agreement
                <InfoTip label="About agreements" side="right">
                  Creates an active agreement from the selected template with included visits and renewal dates
                  calculated from the plan term. Scheduled visits are generated automatically.
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
                  {enrolling ? "Creating…" : "Create agreement"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}