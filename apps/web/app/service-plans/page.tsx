"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/empty-state";
import { formatMoney, type ServicePlanDTO } from "@nnact/shared";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string>) };
  const token = typeof window !== "undefined" ? localStorage.getItem("NNPtoken") : null;
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...headers },
  });
  if (!res.ok) throw new Error(await res.text());
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

const defaultBenefits = ["Priority scheduling", "Included seasonal tune-ups", "Renewal reminders"];

export default function ServicePlansPage() {
  const [plans, setPlans] = useState<ServicePlanDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "Comfort Club",
    description: "Recurring maintenance plan with included visits and priority scheduling.",
    includedVisitsPerTerm: "2",
    termMonths: "12",
    price: "199",
    priorityScheduling: true,
    benefits: defaultBenefits.join("\n"),
  });

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest<ServicePlanDTO[]>("/api/service-plans");
      setPlans(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load service plans");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const activeCount = useMemo(() => plans.filter((p) => p.active).length, [plans]);

  async function createPlan() {
    const priceCents = Math.round(Number.parseFloat(form.price || "0") * 100);
    await apiRequest<ServicePlanDTO>("/api/service-plans", {
      method: "POST",
      body: JSON.stringify({
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        includedVisitsPerTerm: Number.parseInt(form.includedVisitsPerTerm || "0", 10),
        termMonths: Number.parseInt(form.termMonths || "12", 10),
        priceCents,
        priorityScheduling: form.priorityScheduling,
        benefits: form.benefits
          .split("\n")
          .map((x) => x.trim())
          .filter(Boolean),
      }),
    });
    setShowForm(false);
    await load();
  }

  return (
    <div>
      <PageHeader
        title="Service Plans"
        description={`${activeCount} active plan${activeCount !== 1 ? "s" : ""} · memberships, included visits, renewal timing, and priority scheduling`}
        actions={
          <Button size="sm" onClick={() => setShowForm((v) => !v)}>
            ⊕ New Plan
          </Button>
        }
      />

      {showForm && (
        <Card className="mb-5 border-accent/30">
          <div className="grid gap-4">
            <div>
              <h3 className="text-base font-semibold text-fg">Create service plan</h3>
              <p className="text-sm text-fg-muted mt-1">
                Keep this practical: included visits, reminders, renewals, and priority benefits. No loyalty points needed.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Plan name" />
              <Input value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} type="number" min="0" step="0.01" placeholder="Price" />
              <Input value={form.includedVisitsPerTerm} onChange={(e) => setForm((f) => ({ ...f, includedVisitsPerTerm: e.target.value }))} type="number" min="0" placeholder="Included visits" />
              <Input value={form.termMonths} onChange={(e) => setForm((f) => ({ ...f, termMonths: e.target.value }))} type="number" min="1" placeholder="Term months" />
            </div>
            <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Description" />
            <textarea
              value={form.benefits}
              onChange={(e) => setForm((f) => ({ ...f, benefits: e.target.value }))}
              className="min-h-24 rounded-lg border border-border bg-surface-200 px-3 py-2 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
              placeholder="One benefit per line"
            />
            <label className="flex items-center gap-2 text-sm text-fg-muted">
              <input
                type="checkbox"
                checked={form.priorityScheduling}
                onChange={(e) => setForm((f) => ({ ...f, priorityScheduling: e.target.checked }))}
              />
              Priority scheduling benefit
            </label>
            <div className="flex gap-2">
              <Button onClick={createPlan} disabled={!form.name.trim()}>
                Create plan
              </Button>
              <Button variant="secondary" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      )}

      {error && (
        <Card className="mb-5 border-red/30 bg-red/5">
          <p className="text-sm text-red font-medium">Service plan API unavailable</p>
          <p className="text-xs text-fg-muted mt-1">{error}</p>
        </Card>
      )}

      {loading ? (
        <Card>
          <p className="text-sm text-fg-muted">Loading service plans...</p>
        </Card>
      ) : plans.length === 0 ? (
        <Card>
          <EmptyState title="No service plans yet" description="Create a plan like Comfort Club to track included visits, renewal timing, and priority benefits." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {plans.map((plan) => (
            <Card key={plan.id} className="flex flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-fg">{plan.name}</h3>
                  {plan.description && <p className="text-sm text-fg-muted mt-1">{plan.description}</p>}
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${plan.active ? "bg-green/10 text-green" : "bg-surface-500 text-fg-muted"}`}>
                  {plan.active ? "Active" : "Inactive"}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="rounded-lg bg-surface-200 p-3">
                  <p className="text-fg-dim text-xs uppercase tracking-wide">Price</p>
                  <p className="font-semibold text-fg mt-1">{formatMoney(plan.priceCents)}</p>
                </div>
                <div className="rounded-lg bg-surface-200 p-3">
                  <p className="text-fg-dim text-xs uppercase tracking-wide">Visits</p>
                  <p className="font-semibold text-fg mt-1">{plan.includedVisitsPerTerm}</p>
                </div>
                <div className="rounded-lg bg-surface-200 p-3">
                  <p className="text-fg-dim text-xs uppercase tracking-wide">Term</p>
                  <p className="font-semibold text-fg mt-1">{plan.termMonths} mo</p>
                </div>
              </div>
              {plan.benefits?.length > 0 && (
                <ul className="grid gap-2 text-sm text-fg-muted">
                  {plan.benefits.map((benefit) => (
                    <li key={benefit} className="flex gap-2">
                      <span className="text-green">✓</span>
                      {benefit}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
