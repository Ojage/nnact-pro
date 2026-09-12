"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InfoTip } from "@/components/ui/info-tip";
import { EmptyState } from "@/components/empty-state";
import { api } from "@/lib/api";
import { formatMoney, type ServiceCategoryDTO, type ServicePlanDTO } from "@nnact/shared";

const statusColors: Record<string, string> = {
  active: "bg-green/10 text-green",
  draft: "bg-surface-500/60 text-fg-dim",
  inactive: "bg-amber/10 text-amber",
  archived: "bg-red/10 text-red",
};

export default function ServicePlansPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<ServicePlanDTO[]>([]);
  const [categories, setCategories] = useState<ServiceCategoryDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [planRows, categoryRows] = await Promise.all([api.servicePlans(), api.serviceCategories()]);
      setPlans(planRows);
      setCategories(categoryRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load service plans");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const filtered = useMemo(() => {
    const term = filter.trim().toLowerCase();
    if (!term) return plans;
    return plans.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        (p.code ?? "").toLowerCase().includes(term) ||
        (categoryById.get(p.categoryId ?? "")?.name ?? "").toLowerCase().includes(term),
    );
  }, [plans, filter, categoryById]);

  const counts = useMemo(
    () => ({
      active: plans.filter((p) => p.status === "active").length,
      contracts: plans.reduce((sum, p) => sum + (p.activeAgreementCount ?? 0), 0),
    }),
    [plans],
  );

  async function duplicate(plan: ServicePlanDTO) {
    try {
      await api.duplicateServicePlan(plan.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to duplicate plan");
    }
  }

  async function archive(plan: ServicePlanDTO) {
    if (!window.confirm(`Archive “${plan.name}”? Existing agreements are not affected.`)) return;
    try {
      await api.archiveServicePlan(plan.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to archive plan");
    }
  }

  return (
    <div>
      <PageHeader
        title="Service Plans"
        description={
          <span>
            {counts.active} active template{counts.active !== 1 ? "s" : ""} ·{" "}
            <span className="text-fg">{counts.contracts} live agreement{counts.contracts !== 1 ? "s" : ""}</span>{" "}
            currently drawing on these configurations. Plans are frozen into every agreement they are subscribed
            under.
          </span>
        }
        actions={
          <Button size="sm" onClick={() => router.push("/service-plans/new")}>
            ⊕ New Plan
          </Button>
        }
      />

      <div className="mb-5 max-w-sm">
        <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search plans…" />
      </div>

      {error && (
        <Card className="mb-5 border-red/30 bg-red/5">
          <p className="text-sm font-medium text-red">Service plan API unavailable</p>
          <p className="mt-1 text-xs text-fg-muted">{error}</p>
        </Card>
      )}

      {loading ? (
        <Card>
          <p className="text-sm text-fg-muted">Loading service plans…</p>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            title={plans.length === 0 ? "No service plans yet" : "No plans match your search"}
            description={
              plans.length === 0
                ? "Create a template like Commercial AC Care — then subscribe customers under it as agreements with scheduled preventive visits."
                : "Try a different search term."
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {filtered.map((plan) => {
            const category = categoryById.get(plan.categoryId ?? "");
            const benefits = plan.benefits ?? [];
            return (
              <Card key={plan.id} className="flex flex-col gap-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold text-fg">{plan.name}</h3>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${statusColors[plan.status]}`}>
                        {plan.status}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-fg-muted">
                      {[category?.name, plan.planType, plan.targetCustomerType.replace(/_/g, " ")]
                        .filter(Boolean)
                        .join(" · ")}
                      {plan.code ? ` · ${plan.code}` : ""}
                    </p>
                    {plan.description && (
                      <p className="mt-1 text-sm leading-relaxed text-fg-dim">{plan.description}</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <div className="rounded-lg bg-surface-200 p-3">
                    <p className="text-xs uppercase tracking-wide text-fg-dim">Price / term</p>
                    <p className="mt-1 font-semibold text-fg">{formatMoney(plan.priceCents)}</p>
                  </div>
                  <div className="rounded-lg bg-surface-200 p-3">
                    <p className="text-xs uppercase tracking-wide text-fg-dim">Visits</p>
                    <p className="mt-1 font-semibold text-fg">{plan.visitsPerTerm} / {plan.termMonths} mo</p>
                  </div>
                  <div className="rounded-lg bg-surface-200 p-3">
                    <p className="text-xs uppercase tracking-wide text-fg-dim">Every</p>
                    <p className="mt-1 font-semibold capitalize text-fg">{plan.maintenanceFrequency.replace(/_/g, " ")}</p>
                  </div>
                  <div className="rounded-lg bg-surface-200 p-3">
                    <p className="flex items-center gap-1 text-xs uppercase tracking-wide text-fg-dim">
                      Agreements
                      <InfoTip label="Active agreements" side="top">Agreements currently on a live status that were created from this template.</InfoTip>
                    </p>
                    <p className="mt-1 font-semibold text-fg">{plan.activeAgreementCount ?? 0}</p>
                  </div>
                </div>

                {(benefits.length > 0 || (plan.coverageEquipmentTypes ?? []).length > 0) && (
                  <ul className="flex flex-wrap gap-1.5">
                    {benefits.slice(0, 3).map((b) => (
                      <li key={b.key} className="rounded-full bg-green/10 px-2.5 py-0.5 text-xs font-medium text-green">
                        ✓ {b.label}
                      </li>
                    ))}
                    {(plan.coverageEquipmentTypes ?? []).slice(0, 2).map((t) => (
                      <li key={t} className="rounded-full bg-surface-500/50 px-2.5 py-0.5 text-xs text-fg-muted">
                        {t}
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-auto flex items-center gap-2 border-t border-border pt-3">
                  <Link
                    href={`/agreements/new?plan=${plan.id}`}
                    className="inline-flex h-8 items-center rounded-md bg-accent px-3 text-xs font-medium text-white hover:bg-accent/90"
                  >
                    Subscribe customer
                  </Link>
                  <Link
                    href={`/service-plans/${plan.id}`}
                    className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium text-fg hover:border-accent/40"
                  >
                    Edit
                  </Link>
                  <Button variant="secondary" size="sm" onClick={() => duplicate(plan)} disabled={plan.status === "archived"}>
                    Duplicate
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => archive(plan)}
                    disabled={plan.status === "archived" || (plan.activeAgreementCount ?? 0) > 0}
                  >
                    Archive
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}