"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormSelect } from "@/components/ui/form-select";
import { FormSelectOption } from "@/components/ui/form-select";
import { MultiSelect } from "@/components/ui/multi-select";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InfoTip } from "@/components/ui/info-tip";
import { api } from "@/lib/api";
import {
  SERVICE_PLAN_STATUS,
  PLAN_TYPES,
  TARGET_CUSTOMER_TYPES,
  PRICING_MODELS,
  BILLING_FREQUENCIES,
  MAINTENANCE_FREQUENCIES,
  RENEWAL_TYPES,
  SCHEDULE_PRIORITIES,
  VISIT_TYPES,
  PARTS_POLICIES,
  CONSUMABLES_POLICIES,
  EMERGENCY_CALLOUT_COVERAGES,
  formatMoney,
  type ServicePlanDTO,
  type ServiceCategoryDTO,
  type ServiceChecklistDTO,
  type BenefitConfigDTO,
  type CapacityLimitDTO,
} from "@nnact/shared";

const BENEFIT_PRESETS: { key: string; label: string }[] = [
  { key: "priority_scheduling", label: "Priority scheduling" },
  { key: "included_visits", label: "Included visits" },
  { key: "renewal_reminders", label: "Renewal reminders" },
  { key: "free_diagnostics", label: "Free diagnostics" },
  { key: "discounted_parts", label: "Discounted parts" },
  { key: "seasonal_tuneup", label: "Seasonal tune-up checks" },
  { key: "labor_warranty", label: "Labor warranty" },
  { key: "service_line", label: "24/7 service line" },
];

const CAPACITY_SCOPES = [
  { value: "ac_capacity", label: "AC capacity (BTU)" },
  { value: "generator_capacity", label: "Generator capacity (kVA)" },
  { value: "cold_room_size", label: "Cold room size (m³)" },
  { value: "refrigeration_capacity", label: "Refrigeration capacity (BTU)" },
  { value: "other", label: "Other" },
];

function opts<T extends string>(arr: readonly T[] | readonly (readonly [T, string])[]): FormSelectOption[] {
  return (arr as readonly T[]).map((entry) => {
    const [value, rawLabel] = Array.isArray(entry) ? entry : [entry, entry];
    return { value, label: rawLabel.replace(/_/g, " ") };
  });
}

function moneyFromDollars(dollars: string): number {
  return Math.round(Number.parseFloat(dollars || "0") * 100);
}

function dollarsFromCents(cents?: number | null): string {
  if (cents == null) return "0";
  return (cents / 100).toFixed(2).replace(/\.?0+$/, "") || "0";
}

interface PlanForm {
  status: ServicePlanDTO["status"];
  planType: ServicePlanDTO["planType"];
  name: string;
  code: string;
  description: string;
  internalNotes: string;
  categoryId: string;
  coverageCategories: string[];
  coverageEquipmentTypes: string[];
  targetCustomerType: ServicePlanDTO["targetCustomerType"];
  maxCoveredAssets: string;
  capacityLimits: CapacityLimitDTO[];
  pricingModel: ServicePlanDTO["pricingModel"];
  price: string;
  billingFrequency: ServicePlanDTO["billingFrequency"];
  setupFee: string;
  termMonths: string;
  autoRenew: boolean;
  renewalType: ServicePlanDTO["renewalType"];
  renewalRemindersDays: string;
  maintenanceFrequency: ServicePlanDTO["maintenanceFrequency"];
  visitsPerTerm: string;
  primaryVisitType: ServicePlanDTO["primaryVisitType"];
  activities: string[];
  checklistId: string;
  schedulingPriority: ServicePlanDTO["schedulingPriority"];
  targetResponseHours: string;
  emergencyCalloutAllowance: string;
  emergencyCalloutCoverage: ServicePlanDTO["emergencyCalloutCoverage"];
  partsPolicy: ServicePlanDTO["partsPolicy"];
  partsDiscountPercent: string;
  partsAllowance: string;
  consumablesPolicy: ServicePlanDTO["consumablesPolicy"];
  transportIncluded: boolean;
  benefits: BenefitConfigDTO[];
}

function emptyForm(): PlanForm {
  return {
    status: "draft",
    planType: "standard",
    name: "",
    code: "",
    description: "",
    internalNotes: "",
    categoryId: "",
    coverageCategories: [],
    coverageEquipmentTypes: [],
    targetCustomerType: "residential",
    maxCoveredAssets: "",
    capacityLimits: [],
    pricingModel: "fixed",
    price: "0",
    billingFrequency: "annual",
    setupFee: "0",
    termMonths: "12",
    autoRenew: false,
    renewalType: "manual",
    renewalRemindersDays: "30",
    maintenanceFrequency: "quarterly",
    visitsPerTerm: "4",
    primaryVisitType: "preventive",
    activities: [],
    checklistId: "",
    schedulingPriority: "standard",
    targetResponseHours: "",
    emergencyCalloutAllowance: "0",
    emergencyCalloutCoverage: "priority_diagnosis_only",
    partsPolicy: "not_included",
    partsDiscountPercent: "0",
    partsAllowance: "0",
    consumablesPolicy: "not_included",
    transportIncluded: false,
    benefits: [],
  };
}

function formFromPlan(plan?: ServicePlanDTO | null): PlanForm {
  if (!plan) return emptyForm();
  return {
    status: plan.status,
    planType: plan.planType,
    name: plan.name,
    code: plan.code ?? "",
    description: plan.description ?? "",
    internalNotes: plan.internalNotes ?? "",
    categoryId: plan.categoryId ?? "",
    coverageCategories: plan.coverageCategories ?? [],
    coverageEquipmentTypes: plan.coverageEquipmentTypes ?? [],
    targetCustomerType: plan.targetCustomerType,
    maxCoveredAssets: plan.maxCoveredAssets == null ? "" : String(plan.maxCoveredAssets),
    capacityLimits: plan.capacityLimits ?? [],
    pricingModel: plan.pricingModel,
    price: dollarsFromCents(plan.priceCents),
    billingFrequency: plan.billingFrequency,
    setupFee: dollarsFromCents(plan.setupFeeCents),
    termMonths: String(plan.termMonths),
    autoRenew: plan.autoRenew,
    renewalType: plan.renewalType,
    renewalRemindersDays: (plan.renewalReminders ?? [30])[0]?.toString() ?? "30",
    maintenanceFrequency: plan.maintenanceFrequency,
    visitsPerTerm: String(plan.visitsPerTerm),
    primaryVisitType: plan.primaryVisitType,
    activities: plan.activities ?? [],
    checklistId: plan.checklistId ?? "",
    schedulingPriority: plan.schedulingPriority,
    targetResponseHours: plan.targetResponseHours == null ? "" : String(plan.targetResponseHours),
    emergencyCalloutAllowance: String(plan.emergencyCalloutAllowance ?? 0),
    emergencyCalloutCoverage: plan.emergencyCalloutCoverage,
    partsPolicy: plan.partsPolicy,
    partsDiscountPercent: String(plan.partsDiscountPercent ?? 0),
    partsAllowance: dollarsFromCents(plan.partsAllowanceCents),
    consumablesPolicy: plan.consumablesPolicy,
    transportIncluded: plan.transportIncluded,
    benefits: plan.benefits ?? [],
  };
}

const intOrEmpty = (v: string) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
};

export interface PlanEditorProps {
  plan?: ServicePlanDTO | null;
  categories: ServiceCategoryDTO[];
  checklists: ServiceChecklistDTO[];
  onCancel: () => void;
  onSaved: (plan: ServicePlanDTO) => void;
}

export function PlanEditor({ plan, categories, checklists, onCancel, onSaved }: PlanEditorProps) {
  const [form, setForm] = useState<PlanForm>(() => formFromPlan(plan));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customKey, setCustomKey] = useState("");
  const [customLabel, setCustomLabel] = useState("");
  const [activityDraft, setActivityDraft] = useState("");

  const set = <K extends keyof PlanForm>(key: K, value: PlanForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const categoryOptions = useMemo(
    () => categories.map((c) => ({ value: c.id, label: c.name })),
    [categories],
  );
  const checklistOptions = useMemo(
    () => checklists.map((c) => ({ value: c.id, label: c.name })),
    [checklists],
  );
  const categoryNames = useMemo(() => categories.map((c) => c.name), [categories]);

  const selectedCategoryName = categories.find((c) => c.id === form.categoryId)?.name;

  const benefitsCount = form.benefits.length;
  const activePresetKeys = new Set(form.benefits.map((b) => b.key));

  function togglePreset(preset: { key: string; label: string }) {
    if (activePresetKeys.has(preset.key)) {
      set("benefits", form.benefits.filter((b) => b.key !== preset.key));
    } else {
      set("benefits", [...form.benefits, { key: preset.key, label: preset.label }]);
    }
  }

  function addCustomBenefit() {
    if (!customLabel.trim()) return;
    const key = customKey.trim() || `custom_${customLabel.trim().toLowerCase().replace(/\s+/g, "_")}`;
    set("benefits", [...form.benefits, { key, label: customLabel.trim(), custom: true }]);
    setCustomKey("");
    setCustomLabel("");
  }

  function addActivity() {
    if (!activityDraft.trim()) return;
    set("activities", [...form.activities, activityDraft.trim()]);
    setActivityDraft("");
  }

  function addCapacityLimit() {
    set("capacityLimits", [
      ...form.capacityLimits,
      { scope: "other", label: "", max: 1, unit: "" },
    ]);
  }

  async function save() {
    if (!form.name.trim()) {
      setError("Plan name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    const payload = {
      status: form.status,
      planType: form.planType,
      name: form.name.trim(),
      code: form.code.trim() || null,
      description: form.description.trim() || null,
      internalNotes: form.internalNotes.trim() || null,
      categoryId: form.categoryId || null,
      coverageCategories: form.coverageCategories,
      coverageEquipmentTypes: form.coverageEquipmentTypes,
      targetCustomerType: form.targetCustomerType,
      maxCoveredAssets: form.maxCoveredAssets ? intOrEmpty(form.maxCoveredAssets) : null,
      capacityLimits: form.capacityLimits.filter((c) => c.label.trim()),
      pricingModel: form.pricingModel,
      priceCents: moneyFromDollars(form.price),
      billingFrequency: form.billingFrequency,
      setupFeeCents: moneyFromDollars(form.setupFee),
      termMonths: intOrEmpty(form.termMonths) || 12,
      autoRenew: form.autoRenew,
      renewalType: form.renewalType,
      renewalReminders: [intOrEmpty(form.renewalRemindersDays) || 30],
      maintenanceFrequency: form.maintenanceFrequency,
      visitsPerTerm: intOrEmpty(form.visitsPerTerm),
      primaryVisitType: form.primaryVisitType,
      activities: form.activities,
      checklistId: form.checklistId || null,
      schedulingPriority: form.schedulingPriority,
      targetResponseHours: form.targetResponseHours ? intOrEmpty(form.targetResponseHours) : null,
      emergencyCalloutAllowance: intOrEmpty(form.emergencyCalloutAllowance),
      emergencyCalloutCoverage: form.emergencyCalloutCoverage,
      partsPolicy: form.partsPolicy,
      partsDiscountPercent: intOrEmpty(form.partsDiscountPercent),
      partsAllowanceCents: moneyFromDollars(form.partsAllowance),
      consumablesPolicy: form.consumablesPolicy,
      transportIncluded: form.transportIncluded,
      benefits: form.benefits.map((b) => ({
        key: b.key,
        label: b.label,
        details: b.details ?? null,
        custom: b.custom ?? false,
      })),
    };
    try {
      const saved = plan
        ? await api.updateServicePlan(plan.id, payload)
        : await api.createServicePlan(payload);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save plan");
    } finally {
      setSaving(false);
    }
  }

  const actions = (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="secondary" onClick={onCancel}>
        Cancel
      </Button>
      <Button onClick={save} disabled={saving} data-tour="plan-save">
        {saving ? "Saving…" : plan ? "Save changes" : "Create plan"}
      </Button>
    </div>
  );

  const summary = useMemo(() => {
    const coverage = [
      ...(form.coverageCategories.length ? [`${form.coverageCategories.length} categories`] : []),
      ...(form.coverageEquipmentTypes.length ? [`${form.coverageEquipmentTypes.length} equipment types`] : []),
    ];
    return {
      price: moneyFromDollars(form.price),
      term: intOrEmpty(form.termMonths) || 12,
      visits: intOrEmpty(form.visitsPerTerm),
      response: form.targetResponseHours ? `${form.targetResponseHours}h` : "ASAP",
      coverage: coverage.length ? coverage.join(", ") : "All equipment",
      benefits: benefitsCount,
      target: form.targetCustomerType.replace(/_/g, " "),
    };
  }, [form]);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Card className="p-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-fg">
              {plan ? `Edit: ${plan.name}` : "New service plan"}
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-fg-muted">
              Plans are templates. When a customer is subscribed, the configuration is frozen into the
              agreement so later edits never change what existing customers already paid for.
            </p>
          </div>
          {actions}
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red/30 bg-red/5 px-4 py-3 text-sm text-red">{error}</div>
        )}

        <Tabs defaultValue="general">
          <TabsList className="flex">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="coverage">Coverage</TabsTrigger>
            <TabsTrigger value="pricing">Pricing</TabsTrigger>
            <TabsTrigger value="service">Service</TabsTrigger>
            <TabsTrigger value="labour">Labour & Parts</TabsTrigger>
            <TabsTrigger value="benefits">Benefits</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="grid gap-4 pt-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-fg-muted">Plan name *</span>
                <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Commercial AC Care" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-fg-muted">Internal code</span>
                <Input value={form.code} onChange={(e) => set("code", e.target.value)} placeholder="e.g. AC-CARE-B" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-fg-muted">Status</span>
                <FormSelect value={form.status} onChange={(v) => set("status", v as PlanForm["status"])} options={opts(SERVICE_PLAN_STATUS)} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-fg-muted">Plan type</span>
                <FormSelect value={form.planType} onChange={(v) => set("planType", v as PlanForm["planType"])} options={opts(PLAN_TYPES)} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-fg-muted">Primary category</span>
                <FormSelect
                  value={form.categoryId}
                  onChange={(v) => set("categoryId", v)}
                  allowEmpty
                  emptyLabel="—"
                  placeholder="Select a category"
                  options={categoryOptions}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-fg-muted">Target customer</span>
                <FormSelect
                  value={form.targetCustomerType}
                  onChange={(v) => set("targetCustomerType", v as PlanForm["targetCustomerType"])}
                  options={opts(TARGET_CUSTOMER_TYPES)}
                />
              </label>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-fg-muted">Customer-facing description</span>
              <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Shown on quotes and portal listings" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-fg-muted">Internal notes</span>
              <Textarea value={form.internalNotes} onChange={(e) => set("internalNotes", e.target.value)} placeholder="Only visible to staff" />
            </label>
          </TabsContent>

          <TabsContent value="coverage" className="grid gap-4 pt-4">
            <div>
              <p className="mb-1.5 inline-flex items-center gap-1.5 text-xs font-semibold text-fg-muted">
                Covered equipment types
                <InfoTip label="Covered equipment" side="right">Free-form equipment types included in this plan, e.g. “Split AC”, “Cassette AC”, “Generator”.</InfoTip>
              </p>
              <MultiSelect
                options={form.coverageEquipmentTypes.map((x) => ({ value: x, label: x }))}
                selected={form.coverageEquipmentTypes}
                onChange={(v) => set("coverageEquipmentTypes", v)}
                allowCreate
                placeholder="Add equipment types…"
              />
            </div>
            <div>
              <p className="mb-1.5 inline-flex items-center gap-1.5 text-xs font-semibold text-fg-muted">
                Covered categories
                <InfoTip label="Covered categories" side="right">Secondary service categories this plan covers, from your category library.</InfoTip>
              </p>
              <MultiSelect
                options={categoryNames.map((c) => ({ value: c, label: c }))}
                selected={form.coverageCategories}
                onChange={(v) => set("coverageCategories", v)}
                placeholder="Select categories…"
              />
            </div>
            <label className="block">
              <span className="mb-1.5 inline-flex items-center gap-1.5 text-xs font-semibold text-fg-muted">
                Max covered assets
                <InfoTip label="Max covered assets" side="right">How many assets a single agreement can cover. Leave empty for unlimited.</InfoTip>
              </span>
              <Input value={form.maxCoveredAssets} onChange={(e) => set("maxCoveredAssets", e.target.value)} type="number" min="1" placeholder="Unlimited" />
            </label>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-fg-muted">
                  Capacity limits
                  <InfoTip label="Capacity limits" side="right">Size-based restrictions, e.g. AC units up to 24,000 BTU.</InfoTip>
                </p>
                <Button variant="secondary" size="sm" onClick={addCapacityLimit}>
                  + Limit
                </Button>
              </div>
              <div className="grid gap-2">
                {form.capacityLimits.map((limit, idx) => (
                  <div key={idx} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-200 p-2">
                    <FormSelect
                      value={limit.scope}
                      onChange={(v) =>
                        set("capacityLimits", form.capacityLimits.map((c, i) => (i === idx ? { ...c, scope: v as CapacityLimitDTO["scope"] } : c)))
                      }
                      options={CAPACITY_SCOPES}
                      className="min-w-52 flex-1"
                    />
                    <Input
                      className="w-40"
                      value={limit.label}
                      onChange={(e) =>
                        set("capacityLimits", form.capacityLimits.map((c, i) => (i === idx ? { ...c, label: e.target.value } : c)))
                      }
                      placeholder="Label (e.g. AC capacity)"
                    />
                    <Input
                      className="w-24"
                      type="number"
                      value={String(limit.max ?? "")}
                      onChange={(e) =>
                        set("capacityLimits", form.capacityLimits.map((c, i) => (i === idx ? { ...c, max: intOrEmpty(e.target.value) } : c)))
                      }
                      placeholder="Max"
                    />
                    <Input
                      className="w-24"
                      value={limit.unit ?? ""}
                      onChange={(e) =>
                        set("capacityLimits", form.capacityLimits.map((c, i) => (i === idx ? { ...c, unit: e.target.value } : c)))
                      }
                      placeholder="Unit"
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => set("capacityLimits", form.capacityLimits.filter((_, i) => i !== idx))}
                    >
                      ✕
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="pricing" className="grid gap-4 pt-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-fg-muted">Pricing model</span>
              <FormSelect value={form.pricingModel} onChange={(v) => set("pricingModel", v as PlanForm["pricingModel"])} options={opts(PRICING_MODELS)} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-fg-muted">Billing frequency</span>
              <FormSelect value={form.billingFrequency} onChange={(v) => set("billingFrequency", v as PlanForm["billingFrequency"])} options={opts(BILLING_FREQUENCIES)} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-fg-muted">Price per term</span>
              <Input value={form.price} onChange={(e) => set("price", e.target.value)} type="number" min="0" step="0.01" placeholder="0.00" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-fg-muted">Setup fee</span>
              <Input value={form.setupFee} onChange={(e) => set("setupFee", e.target.value)} type="number" min="0" step="0.01" placeholder="0.00" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-fg-muted">Term length (months)</span>
              <Input value={form.termMonths} onChange={(e) => set("termMonths", e.target.value)} type="number" min="1" placeholder="12" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-fg-muted">Renewal type</span>
              <FormSelect value={form.renewalType} onChange={(v) => set("renewalType", v as PlanForm["renewalType"])} options={opts(RENEWAL_TYPES)} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-fg-muted">Renewal reminder (days before end)</span>
              <Input value={form.renewalRemindersDays} onChange={(e) => set("renewalRemindersDays", e.target.value)} type="number" min="1" placeholder="30" />
            </label>
            <div className="flex items-center justify-between rounded-lg border border-border bg-surface-200 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-fg">Auto-renew</p>
                <p className="text-xs text-fg-muted">Renew automatically at the end of each term</p>
              </div>
              <Switch checked={form.autoRenew} onCheckedChange={(v) => set("autoRenew", v)} />
            </div>
          </TabsContent>

          <TabsContent value="service" className="grid gap-4 pt-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-fg-muted">Maintenance frequency</span>
              <FormSelect
                value={form.maintenanceFrequency}
                onChange={(v) => set("maintenanceFrequency", v as PlanForm["maintenanceFrequency"])}
                options={opts(MAINTENANCE_FREQUENCIES)}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-fg-muted">Visits per term</span>
              <Input value={form.visitsPerTerm} onChange={(e) => set("visitsPerTerm", e.target.value)} type="number" min="0" placeholder="4" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-fg-muted">Primary visit type</span>
              <FormSelect
                value={form.primaryVisitType}
                onChange={(v) => set("primaryVisitType", v as PlanForm["primaryVisitType"])}
                options={opts(VISIT_TYPES)}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-fg-muted">Checklist</span>
              <FormSelect
                value={form.checklistId}
                onChange={(v) => set("checklistId", v)}
                allowEmpty
                emptyLabel="No checklist"
                placeholder="No checklist"
                options={checklistOptions}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-fg-muted">Scheduling priority</span>
              <FormSelect
                value={form.schedulingPriority}
                onChange={(v) => set("schedulingPriority", v as PlanForm["schedulingPriority"])}
                options={opts(SCHEDULE_PRIORITIES)}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-fg-muted">Target response (hours)</span>
              <Input value={form.targetResponseHours} onChange={(e) => set("targetResponseHours", e.target.value)} type="number" min="1" placeholder="e.g. 72" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-fg-muted">Emergency callout allowance</span>
              <Input
                value={form.emergencyCalloutAllowance}
                onChange={(e) => set("emergencyCalloutAllowance", e.target.value)}
                type="number"
                step="1"
                placeholder="0 (0 = none, -1 = unlimited)"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-fg-muted">Emergency callout coverage</span>
              <FormSelect
                value={form.emergencyCalloutCoverage}
                onChange={(v) => set("emergencyCalloutCoverage", v as PlanForm["emergencyCalloutCoverage"])}
                options={opts(EMERGENCY_CALLOUT_COVERAGES)}
              />
            </label>
            <div className="sm:col-span-2">
              <p className="mb-1.5 block text-xs font-semibold text-fg-muted">Included activities</p>
              <div className="flex flex-wrap gap-2">
                {form.activities.map((activity, idx) => (
                  <span key={idx} className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
                    {activity}
                    <button
                      type="button"
                      className="text-accent/60 hover:text-accent"
                      onClick={() => set("activities", form.activities.filter((_, i) => i !== idx))}
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <Input value={activityDraft} onChange={(e) => setActivityDraft(e.target.value)} placeholder="e.g. Filter cleaning" />
                <Button variant="secondary" onClick={addActivity} disabled={!activityDraft.trim()}>
                  Add
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="labour" className="grid gap-4 pt-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-fg-muted">Parts policy</span>
              <FormSelect value={form.partsPolicy} onChange={(v) => set("partsPolicy", v as PlanForm["partsPolicy"])} options={opts(PARTS_POLICIES)} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-fg-muted">Parts discount (%)</span>
              <Input value={form.partsDiscountPercent} onChange={(e) => set("partsDiscountPercent", e.target.value)} type="number" min="0" max="100" placeholder="0" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-fg-muted">Parts allowance per visit</span>
              <Input value={form.partsAllowance} onChange={(e) => set("partsAllowance", e.target.value)} type="number" min="0" step="0.01" placeholder="0.00" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-fg-muted">Consumables policy</span>
              <FormSelect
                value={form.consumablesPolicy}
                onChange={(v) => set("consumablesPolicy", v as PlanForm["consumablesPolicy"])}
                options={opts(CONSUMABLES_POLICIES)}
              />
            </label>
            <div className="flex items-center justify-between rounded-lg border border-border bg-surface-200 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-fg">Transport included</p>
                <p className="text-xs text-fg-muted">Travel time to the site is covered by the plan</p>
              </div>
              <Switch checked={form.transportIncluded} onCheckedChange={(v) => set("transportIncluded", v)} />
            </div>
          </TabsContent>

          <TabsContent value="benefits" className="grid gap-4 pt-4">
            <div className="grid gap-2">
              <p className="text-xs font-semibold text-fg-muted">Feature benefits</p>
              <div className="flex flex-wrap gap-2">
                {BENEFIT_PRESETS.map((preset) => {
                  const active = activePresetKeys.has(preset.key);
                  return (
                    <button
                      key={preset.key}
                      type="button"
                      onClick={() => togglePreset(preset)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        active
                          ? "border-accent bg-accent text-white"
                          : "border-border bg-surface-200 text-fg-muted hover:border-accent/40"
                      }`}
                    >
                      {active ? "✓ " : ""}{preset.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-surface-200 p-3">
              <p className="mb-2 text-xs font-semibold text-fg-muted">Custom benefit</p>
              <div className="flex flex-wrap items-center gap-2">
                <Input value={customKey} onChange={(e) => setCustomKey(e.target.value)} placeholder="Key (optional, e.g. hotel_stay)" className="w-48" />
                <Input value={customLabel} onChange={(e) => setCustomLabel(e.target.value)} placeholder="Label (e.g. Backup generator standby)" className="flex-1 min-w-48" />
                <Button variant="secondary" onClick={addCustomBenefit} disabled={!customLabel.trim()}>
                  Add
                </Button>
              </div>
            </div>
            {form.benefits.length > 0 && (
              <ul className="grid gap-1.5">
                {form.benefits.map((benefit, idx) => (
                  <li key={`${benefit.key}-${idx}`} className="flex items-start justify-between gap-3 rounded-lg bg-surface-200 px-3 py-2 text-sm">
                    <span className="text-fg">
                      <span className="text-green">✓ </span>
                      {benefit.label}
                      <span className="ml-1 text-xs text-fg-muted">({benefit.key})</span>
                    </span>
                    <button
                      type="button"
                      className="text-xs text-fg-dim hover:text-red"
                      onClick={() => set("benefits", form.benefits.filter((_, i) => i !== idx))}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        </Tabs>
      </Card>

      <Card className="h-fit p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-dim">Plan summary</h3>
        <dl className="mt-4 grid gap-3 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-fg-muted">Status</dt>
            <dd className="font-medium capitalize text-fg">{form.status.replace("_", " ")}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-fg-muted">Category</dt>
            <dd className="font-medium text-fg">{form.coverageCategories.length ? `${form.coverageCategories.length} covered` : (selectedCategoryName ?? "—")}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-fg-muted">Coverage</dt>
            <dd className="max-w-44 text-right font-medium text-fg">{summary.coverage}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-fg-muted">Target</dt>
            <dd className="font-medium capitalize text-fg">{summary.target}</dd>
          </div>
          <div className="h-px bg-border" />
          <div className="flex items-center justify-between">
            <dt className="text-fg-muted">Price</dt>
            <dd className="text-base font-semibold text-fg">{formatMoney(summary.price)}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-fg-muted">Term</dt>
            <dd className="font-medium text-fg">{summary.term} months</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-fg-muted">Visits / term</dt>
            <dd className="font-medium text-fg">{summary.visits}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-fg-muted">Every</dt>
            <dd className="font-medium capitalize text-fg">{form.maintenanceFrequency.replace(/_/g, " ")}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-fg-muted">Response</dt>
            <dd className="font-medium text-fg">{summary.response}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-fg-muted">Benefits</dt>
            <dd className="font-medium text-fg">{summary.benefits}</dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}