"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormSelect } from "@/components/ui/form-select";
import { Switch } from "@/components/ui/switch";
import { InfoTip } from "@/components/ui/info-tip";
import { api } from "@/lib/api";
import {
  BILLING_FREQUENCIES,
  MAINTENANCE_FREQUENCIES,
  formatMoney,
  type CustomerDTO,
  type ServicePlanDTO,
  type ServiceLocationDTO,
} from "@nnact/shared";

export default function NewAgreementPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const presetPlanId = searchParams.get("plan") ?? "";

  const [customers, setCustomers] = useState<CustomerDTO[]>([]);
  const [plans, setPlans] = useState<ServicePlanDTO[]>([]);
  const [locations, setLocations] = useState<ServiceLocationDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [mode, setMode] = useState<"template" | "custom">(presetPlanId ? "template" : "template");
  const [customerId, setCustomerId] = useState("");
  const [planId, setPlanId] = useState(presetPlanId);
  const [customName, setCustomName] = useState("");
  const [startsOn, setStartsOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [termMonths, setTermMonths] = useState("12");
  const [price, setPrice] = useState("0");
  const [visitsIncluded, setVisitsIncluded] = useState("4");
  const [billingFrequency, setBillingFrequency] = useState("annual");
  const [maintenanceFrequency, setMaintenanceFrequency] = useState("quarterly");
  const [locationId, setLocationId] = useState("");
  const [notes, setNotes] = useState("");
  const [autoActivate, setAutoActivate] = useState(true);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [customerRows, planRows] = await Promise.all([api.customers(), api.servicePlans()]);
      setCustomers(customerRows);
      setPlans(planRows.filter((p) => p.status !== "archived"));
      if (customerRows.length === 1) setCustomerId(customerRows[0].id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const selectedPlan = useMemo(() => plans.find((p) => p.id === planId), [plans, planId]);

  async function loadLocations(cid: string) {
    try {
      setLocations(await api.serviceLocations(cid));
    } catch {
      setLocations([]);
    }
  }

  useEffect(() => {
    if (customerId) void loadLocations(customerId);
  }, [customerId]);

  useEffect(() => {
    if (!selectedPlan) return;
    setTermMonths(String(selectedPlan.termMonths));
    setPrice((selectedPlan.priceCents / 100).toFixed(2));
    setVisitsIncluded(String(selectedPlan.visitsPerTerm));
    setBillingFrequency(selectedPlan.billingFrequency);
    setMaintenanceFrequency(selectedPlan.maintenanceFrequency);
  }, [selectedPlan]);

  async function create() {
    if (!customerId) {
      setError("Select a customer.");
      return;
    }
    const startsAt = new Date(`${startsOn || "1970-01-01"}T00:00:00Z`).toISOString();
    if (isNaN(new Date(startsAt).getTime())) {
      setError("A valid start date is required.");
      return;
    }
    const payload: Record<string, unknown> = {
      customerId,
      startsAt,
      serviceLocationId: locationId || null,
      notes: notes.trim() || null,
      status: autoActivate ? "active" : "draft",
    };
    if (mode === "template") {
      if (!planId) {
        setError("Select a plan template.");
        return;
      }
      payload.planId = planId;
    } else {
      if (!customName.trim()) {
        setError("A name is required for a custom agreement.");
        return;
      }
      payload.planName = customName.trim();
      payload.termMonths = Number.parseInt(termMonths, 10) || 12;
      payload.priceCents = Math.round(Number.parseFloat(price || "0") * 100);
      payload.visitsIncluded = Number.parseInt(visitsIncluded, 10) || 0;
      payload.billingFrequency = billingFrequency;
      payload.maintenanceFrequency = maintenanceFrequency;
    }

    setSaving(true);
    setError(null);
    try {
      const created = await api.createServiceAgreement(payload);
      router.push(`/agreements/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create agreement");
      setSaving(false);
    }
  }

  const estimatedTotal =
    mode === "template"
      ? selectedPlan
        ? selectedPlan.priceCents + selectedPlan.setupFeeCents
        : 0
      : Math.round(Number.parseFloat(price || "0") * 100);

  return (
    <div>
      <PageHeader
        title="New Service Agreement"
        description="Subscribe a customer under a plan template (config is frozen) or create a standalone custom agreement."
        actions={
          <Button variant="secondary" onClick={() => router.push("/agreements")}>
            Cancel
          </Button>
        }
      />

      {error && (
        <Card className="mb-5 border-red/30 bg-red/5">
          <p className="text-sm font-medium text-red">{error}</p>
        </Card>
      )}

      {loading ? (
        <Card>
          <p className="text-sm text-fg-muted">Loading…</p>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <Card className="p-6">
            <div className="grid gap-5">
              <div className="grid items-center gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-fg-muted">Customer *</span>
                  <FormSelect
                    value={customerId}
                    onChange={setCustomerId}
                    placeholder="Select a customer"
                    options={customers.map((c) => ({ value: c.id, label: c.name }))}
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-fg-muted">Service location</span>
                  <FormSelect
                    value={locationId}
                    onChange={setLocationId}
                    allowEmpty
                    emptyLabel="No specific location"
                    placeholder="No specific location"
                    disabled={!customerId}
                    options={locations.map((l) => ({ value: l.id, label: `${l.name}${l.address ? ` — ${l.address}` : ""}` }))}
                  />
                </label>
              </div>

              <div>
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-fg-dim">Source</span>
                  <div className="flex gap-1 rounded-lg bg-surface-200 p-1">
                    <button
                      type="button"
                      onClick={() => setMode("template")}
                      className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${mode === "template" ? "bg-accent text-white" : "text-fg-muted hover:text-fg"}`}
                    >
                      Use a template
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode("custom")}
                      className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${mode === "custom" ? "bg-accent text-white" : "text-fg-muted hover:text-fg"}`}
                    >
                      Custom agreement
                    </button>
                  </div>
                </div>

                {mode === "template" ? (
                  <div className="grid gap-2">
                    <FormSelect
                      value={planId}
                      onChange={setPlanId}
                      placeholder="Select a plan template"
                      options={plans.map((p) => ({
                        value: p.id,
                        label: `${p.name} — ${formatMoney(p.priceCents)}/term, ${p.visitsPerTerm} visits`,
                      }))}
                    />
                    {selectedPlan && (
                      <div className="rounded-lg border border-border bg-surface-200 p-3 text-sm">
                        <div className="flex flex-wrap justify-between gap-2 text-fg-muted">
                          <span>
                            {selectedPlan.coverageEquipmentTypes.length} equipment
                            type{selectedPlan.coverageEquipmentTypes.length !== 1 ? "s" : ""} covered
                          </span>
                          <span className="capitalize">{selectedPlan.maintenanceFrequency.replace(/_/g, " ")} service</span>
                          <span>{formatMoney(selectedPlan.priceCents)}/term</span>
                        </div>
                        <p className="mt-2 text-xs text-fg-dim">
                          The agreement freezes these settings. Later edits to the plan will not affect it.
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block sm:col-span-2">
                      <span className="mb-1.5 block text-xs font-semibold text-fg-muted">Agreement name *</span>
                      <Input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="e.g. Custom maintenance pack" />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-semibold text-fg-muted">Price</span>
                      <Input value={price} onChange={(e) => setPrice(e.target.value)} type="number" min="0" step="0.01" />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-semibold text-fg-muted">Term (months)</span>
                      <Input value={termMonths} onChange={(e) => setTermMonths(e.target.value)} type="number" min="1" />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-semibold text-fg-muted">Included visits</span>
                      <Input value={visitsIncluded} onChange={(e) => setVisitsIncluded(e.target.value)} type="number" min="0" />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-semibold text-fg-muted">Billing frequency</span>
                      <FormSelect value={billingFrequency} onChange={setBillingFrequency} options={BILLING_FREQUENCIES.map((v) => ({ value: v, label: v.replace(/_/g, " ") }))} />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-semibold text-fg-muted">Maintenance frequency</span>
                      <FormSelect value={maintenanceFrequency} onChange={setMaintenanceFrequency} options={MAINTENANCE_FREQUENCIES.map((v) => ({ value: v, label: v.replace(/_/g, " ") }))} />
                    </label>
                  </div>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-fg-muted">Start date</span>
                  <Input value={startsOn} onChange={(e) => setStartsOn(e.target.value)} type="date" />
                </label>
                <div className="flex items-center justify-between rounded-lg border border-border bg-surface-200 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-fg">Activate on creation</p>
                    <p className="text-xs text-fg-muted">Generate scheduled visits immediately</p>
                  </div>
                  <Switch checked={autoActivate} onCheckedChange={setAutoActivate} />
                </div>
              </div>

              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-fg-muted">Notes</span>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Agreement notes (internal)" />
              </label>

              <div className="flex justify-end">
                <Button onClick={create} disabled={saving}>
                  {saving ? "Creating…" : "Create agreement"}
                </Button>
              </div>
            </div>
          </Card>

          <Card className="h-fit p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-dim">Summary</h3>
            <dl className="mt-4 grid gap-3 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-fg-muted">Customer</dt>
                <dd className="font-medium text-fg">{customers.find((c) => c.id === customerId)?.name ?? "—"}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-fg-muted">Plan</dt>
                <dd className="max-w-44 text-right font-medium text-fg">
                  {mode === "template" ? (selectedPlan?.name ?? "—") : (customName || "—")}
                </dd>
              </div>
              <div className="h-px bg-border" />
              <div className="flex items-center justify-between">
                <dt className="inline-flex items-center gap-1 text-fg-muted">
                  Price
                  <InfoTip label="Total">Price + setup fee for template agreements.</InfoTip>
                </dt>
                <dd className="text-base font-semibold text-fg">{formatMoney(estimatedTotal)}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-fg-muted">Term</dt>
                <dd className="font-medium text-fg">
                  {startsOn} →{" "}
                  {(() => {
                    const end = new Date(`${startsOn}T00:00:00Z`);
                    end.setUTCMonth(end.getUTCMonth() + (Number.parseInt(termMonths, 10) || 12));
                    return end.toISOString().slice(0, 10);
                  })()}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-fg-muted">Visits</dt>
                <dd className="font-medium text-fg">{visitsIncluded}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-fg-muted">Status</dt>
                <dd className="font-medium capitalize text-fg">{autoActivate ? "active" : "draft"}</dd>
              </div>
            </dl>
          </Card>
        </div>
      )}
    </div>
  );
}