"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Ban,
  Check,
  ChevronDown,
  CircleAlert,
  Layers,
  ListChecks,
  Pencil,
  Plus,
  Route,
  ShieldCheck,
  Tag,
  Trash2,
  Wand2,
  Wrench,
  X,
} from "lucide-react";
import {
  CUSTOM_VALUE,
  diagnosticsApi,
  type DiagnosticMeta,
  type DiagnosticStep,
  type DiagnosticStepTemplate,
  type DiagnosticWorkflow,
  type MetaOption,
  type ReadinessReport,
  type TraceRoute,
} from "@/lib/diagnostics-api";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormSelect } from "@/components/ui/form-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LimitedTextarea } from "@/components/ui/limited-textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/components/ui/utils";

// ── Shared helpers ────────────────────────────────────────────────────

function optionLabel(options: MetaOption[], value: string | null | undefined): string {
  if (!value) return "";
  return options.find((option) => option.value === value)?.label ?? value;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function statusTone(status: string) {
  if (["published", "validated"].includes(status)) return "bg-green/10 text-green";
  if (["suspended", "unsupported"].includes(status)) return "bg-red/10 text-red";
  if (["pilot", "experimental"].includes(status)) return "bg-yellow/10 text-yellow";
  if (status === "draft") return "bg-surface-300 text-fg-muted";
  return "bg-surface-400 text-fg-muted";
}

// ── Select with an optional custom value ───────────────────────────────

function VocabSelect({
  label,
  options,
  value,
  custom,
  onChange,
  onCustomChange,
  placeholder = "Select…",
  allowEmpty = false,
  emptyLabel = "None",
  required = false,
}: {
  label: string;
  options: MetaOption[];
  value: string;
  custom: string;
  onChange: (value: string) => void;
  onCustomChange: (value: string) => void;
  placeholder?: string;
  allowEmpty?: boolean;
  emptyLabel?: string;
  required?: boolean;
}) {
  const selectOptions = useMemo(
    () => [...(allowEmpty ? [] : []), ...options.map((option) => ({ value: option.value, label: option.label })), { value: CUSTOM_VALUE, label: "Custom…" }],
    [options, allowEmpty],
  );
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
        {label} {required && <span className="text-red"> *</span>}
      </Label>
      <FormSelect
        value={value}
        onChange={onChange}
        options={selectOptions}
        placeholder={placeholder}
        allowEmpty={allowEmpty}
        emptyLabel={emptyLabel}
      />
      {value === CUSTOM_VALUE && (
        <Input value={custom} onChange={(event) => onCustomChange(event.target.value)} placeholder="Describe it…" className="mt-1" />
      )}
    </div>
  );
}

// ── Destructive button with inline confirmation ───────────────────────

function DeleteButton({ onConfirm, disabled }: { onConfirm: () => void; disabled?: boolean }) {
  const [arming, setArming] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      disabled={disabled}
      className={cn("h-7 gap-1.5 text-red hover:bg-red/10 hover:text-red", arming && "bg-red/10 text-red")}
      onClick={() => {
        if (arming) {
          window.clearTimeout(timer.current);
          setArming(false);
          onConfirm();
        } else {
          setArming(true);
          timer.current = window.setTimeout(() => setArming(false), 2500);
        }
      }}
    >
      {arming ? (
        <>
          <CircleAlert className="size-3.5" aria-hidden /> Confirm?
        </>
      ) : (
        <>
          <Trash2 className="size-3.5" aria-hidden /> Delete
        </>
      )}
    </Button>
  );
}

// ── Workflow form (create + edit) ─────────────────────────────────────

const knownMakes = ["Whirlpool", "GE", "Samsung", "LG", "Frigidaire", "Bosch", "KitchenAid", "Maytag", "Electrolux", "Miele"];

function WorkflowForm({
  meta,
  initial,
  onSubmit,
  submitLabel,
  onCancel,
}: {
  meta: DiagnosticMeta;
  initial?: DiagnosticWorkflow | null;
  onSubmit: (payload: { name: string; productType: string; productTypeLabel?: string; make?: string; modelFamily?: string; sourceRevision?: string; models: string[]; limitations: string[] }) => Promise<void>;
  submitLabel: string;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [productType, setProductType] = useState(initial ? (meta.productTypes.some((o) => o.value === initial.productType) ? initial.productType : CUSTOM_VALUE) : "");
  const [productTypeCustom, setProductTypeCustom] = useState(initial ? (meta.productTypes.some((o) => o.value === initial.productType) ? "" : initial.productType) : "");
  const [make, setMake] = useState(initial?.make ?? "");
  const [modelFamily, setModelFamily] = useState(initial?.modelFamily ?? "");
  const [sourceRevision, setSourceRevision] = useState(initial?.sourceRevision ?? "");
  const [models, setModels] = useState(initial?.applicability?.models ?? []);
  const [modelDraft, setModelDraft] = useState("");
  const [limitations, setLimitations] = useState(initial?.limitations.join("\n") ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const productTypeError = !productType || (productType === CUSTOM_VALUE && !productTypeCustom.trim());
  const nameError = !name.trim();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (nameError || productTypeError) return;
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        productType,
        ...(productType === CUSTOM_VALUE ? { productTypeLabel: productTypeCustom.trim() } : {}),
        make: make.trim() || undefined,
        modelFamily: modelFamily.trim() || undefined,
        sourceRevision: sourceRevision.trim() || undefined,
        models,
        limitations: limitations.split("\n").map((value) => value.trim()).filter(Boolean),
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Workflow name *</Label>
        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. French-door refrigerator — evaporator fan" maxLength={120} />
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Product type *</Label>
        <div className="flex flex-wrap gap-1.5">
          {meta.productTypes.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setProductType(option.value)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                productType === option.value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-surface-200 text-fg-muted hover:bg-surface-300",
              )}
            >
              {option.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setProductType(CUSTOM_VALUE)}
            className={cn(
              "flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              productType === CUSTOM_VALUE
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-surface-200 text-fg-muted hover:bg-surface-300",
            )}
          >
            {productType === CUSTOM_VALUE ? <Check className="size-3.5" aria-hidden /> : <Plus className="size-3.5" aria-hidden />}
            Custom…
          </button>
        </div>
        {productType === CUSTOM_VALUE && (
          <Input value={productTypeCustom} onChange={(event) => setProductTypeCustom(event.target.value)} placeholder="e.g. Chest freezer" className="mt-1" />
        )}
        {productTypeError && <p className="text-xs text-red">Choose a product type (or describe one).</p>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Make</Label>
          <FormSelect value={knownMakes.includes(make) ? make : ""} onChange={(value) => setMake(value)} allowEmpty emptyLabel="—" options={knownMakes.map((m) => ({ value: m, label: m }))} />
          <Input value={knownMakes.includes(make) ? "" : make} onChange={(event) => setMake(event.target.value)} placeholder="or another make…" />
        </div>
        <div className="space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Model family</Label>
          <Input value={modelFamily} onChange={(event) => setModelFamily(event.target.value)} placeholder="e.g. WRX735SDBM" />
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Source revision</Label>
        <Input value={sourceRevision} onChange={(event) => setSourceRevision(event.target.value)} placeholder="e.g. Service manual Rev B" />
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Applicable models</Label>
        {models.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {models.map((model) => (
              <span key={model} className="flex items-center gap-1 rounded-full bg-surface-300 px-2.5 py-1 text-xs text-fg">
                {model}
                <button type="button" onClick={() => setModels(models.filter((m) => m !== model))} className="text-fg-muted hover:text-red" aria-label={`Remove ${model}`}>
                  <X className="size-3" aria-hidden />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Input
            value={modelDraft}
            onChange={(event) => setModelDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                const value = modelDraft.trim();
                if (value && !models.includes(value)) setModels([...models, value]);
                setModelDraft("");
              }
            }}
            placeholder="Type a model number and press Enter"
          />
          <Button
            type="button"
            variant="secondary"
            disabled={!modelDraft.trim() || models.includes(modelDraft.trim())}
            onClick={() => {
              const value = modelDraft.trim();
              if (value && !models.includes(value)) setModels([...models, value]);
              setModelDraft("");
            }}
          >
            Add
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Known limitations</Label>
        <LimitedTextarea value={limitations} onChange={(event) => setLimitations(event.target.value)} rows={3} maxLength={800} placeholder="One known limitation per line (e.g. not valid for side-by-side models)" />
      </div>

      {error && (
        <p className="rounded-lg border border-red/30 bg-red/5 p-3 text-sm text-red" role="alert">{error}</p>
      )}

      <div className="flex items-center gap-2">
        <Button type="submit" loading={submitting} disabled={nameError || productTypeError}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>Cancel</Button>
        )}
      </div>
    </form>
  );
}

// ── Step editor (create + edit) ────────────────────────────────────────

interface StepFormState {
  stepKey: string;
  publicLabel: string;
  stepType: string;
  mode: string;
  purpose: string;
  safetyState: string;
  powerState: string;
  powerStateCustom: string;
  operatingCondition: string;
  operatingConditionCustom: string;
  meterMode: string;
  meterModeCustom: string;
  point1Label: string;
  point1Endpoint: string;
  point2Label: string;
  point2Endpoint: string;
  connector: string;
  pin: string;
  wireColor: string;
  expectedText: string;
  unit: string;
  unitCustom: string;
  passInterpretation: string;
  failInterpretation: string;
  accessibilityNote: string;
  validationStatus: string;
}

function emptyStepForm(): StepFormState {
  return {
    stepKey: "",
    publicLabel: "",
    stepType: "check",
    mode: "both",
    purpose: "",
    safetyState: "",
    powerState: "",
    powerStateCustom: "",
    operatingCondition: "",
    operatingConditionCustom: "",
    meterMode: "",
    meterModeCustom: "",
    point1Label: "",
    point1Endpoint: "",
    point2Label: "",
    point2Endpoint: "",
    connector: "",
    pin: "",
    wireColor: "",
    expectedText: "",
    unit: "",
    unitCustom: "",
    passInterpretation: "",
    failInterpretation: "",
    accessibilityNote: "",
    validationStatus: "unreviewed",
  };
}

function stepToForm(step: DiagnosticStep): StepFormState {
  return {
    stepKey: step.stepKey,
    publicLabel: step.publicLabel,
    stepType: step.stepType,
    mode: step.mode,
    purpose: step.purpose ?? "",
    safetyState: step.safetyState ?? "",
    powerState: step.powerState ?? "",
    powerStateCustom: "",
    operatingCondition: step.operatingCondition ?? "",
    operatingConditionCustom: "",
    meterMode: step.meterMode ?? "",
    meterModeCustom: "",
    point1Label: step.point1Label ?? "",
    point1Endpoint: step.point1Endpoint ?? "",
    point2Label: step.point2Label ?? "",
    point2Endpoint: step.point2Endpoint ?? "",
    connector: step.connector ?? "",
    pin: step.pin ?? "",
    wireColor: step.wireColor ?? "",
    expectedText: step.expectedText ?? "",
    unit: step.unit ?? "",
    unitCustom: "",
    passInterpretation: step.passInterpretation ?? "",
    failInterpretation: step.failInterpretation ?? "",
    accessibilityNote: step.accessibilityNote ?? "",
    validationStatus: step.validationStatus,
  };
}

function templateToForm(template: DiagnosticStepTemplate, meta: DiagnosticMeta): StepFormState {
  const form = emptyStepForm();
  form.stepType = template.stepType;
  form.mode = template.mode;
  const pick = (options: MetaOption[], value?: string) => (options.some((o) => o.value === value) ? value ?? "" : "");
  form.meterMode = pick(meta.meterModes, template.meterMode);
  form.powerState = pick(meta.powerStates, template.powerState);
  form.operatingCondition = pick(meta.operatingConditions, template.operatingCondition);
  form.unit = pick(meta.units, template.unit);
  form.point1Label = template.point1Label ?? "";
  form.point2Label = template.point2Label ?? "";
  form.connector = template.connector ?? "";
  form.pin = template.pin ?? "";
  form.expectedText = template.expectedText ?? "";
  form.passInterpretation = template.passInterpretation ?? "";
  form.failInterpretation = template.failInterpretation ?? "";
  form.accessibilityNote = template.accessibilityNote ?? "";
  return form;
}

function slugifyPublicLabel(label: string): string {
  return slugify(label);
}

function StepEditor({
  meta,
  workflowId,
  existingKeys,
  existingSequence,
  initial,
  onSaved,
}: {
  meta: DiagnosticMeta;
  workflowId: string;
  existingKeys: string[];
  existingSequence: number;
  initial?: DiagnosticStep | null;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState<StepFormState>(() => (initial ? stepToForm(initial) : emptyStepForm()));
  const [keyDirty, setKeyDirty] = useState(!!initial);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const set = <K extends keyof StepFormState>(key: K, value: StepFormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const isCheck = form.stepType === "check";
  const duplicateKey = !initial && form.stepKey && existingKeys.includes(form.stepKey);
  const keyError = !form.stepKey.trim() || duplicateKey;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (keyError) return;
    setError(null);
    setSubmitting(true);
    try {
      const payload = {
        stepKey: form.stepKey.trim(),
        publicLabel: form.publicLabel.trim(),
        ...(initial ? {} : { sequence: existingSequence }),
        ...(form.mode ? { mode: form.mode as "field" | "guided" | "both" } : {}),
        ...(form.stepType ? { stepType: form.stepType as "check" | "decision" | "reference" | "stop" } : {}),
        ...(form.purpose.trim() ? { purpose: form.purpose.trim() } : {}),
        ...(form.safetyState.trim() ? { safetyState: form.safetyState.trim() } : {}),
        ...(form.powerState === CUSTOM_VALUE ? { powerState: form.powerStateCustom.trim() } : form.powerState ? { powerState: form.powerState } : {}),
        ...(form.operatingCondition === CUSTOM_VALUE ? { operatingCondition: form.operatingConditionCustom.trim() } : form.operatingCondition ? { operatingCondition: form.operatingCondition } : {}),
        ...(form.meterMode === CUSTOM_VALUE ? { meterMode: form.meterModeCustom.trim() } : form.meterMode ? { meterMode: form.meterMode } : {}),
        ...(form.unit === CUSTOM_VALUE ? { unit: form.unitCustom.trim() } : form.unit ? { unit: form.unit } : {}),
        ...(form.point1Label.trim() ? { point1Label: form.point1Label.trim() } : {}),
        ...(form.point1Endpoint.trim() ? { point1Endpoint: form.point1Endpoint.trim() } : {}),
        ...(form.point2Label.trim() ? { point2Label: form.point2Label.trim() } : {}),
        ...(form.point2Endpoint.trim() ? { point2Endpoint: form.point2Endpoint.trim() } : {}),
        ...(form.connector.trim() ? { connector: form.connector.trim() } : {}),
        ...(form.pin.trim() ? { pin: form.pin.trim() } : {}),
        ...(form.wireColor.trim() ? { wireColor: form.wireColor.trim() } : {}),
        ...(form.expectedText.trim() ? { expectedText: form.expectedText.trim() } : {}),
        ...(form.passInterpretation.trim() ? { passInterpretation: form.passInterpretation.trim() } : {}),
        ...(form.failInterpretation.trim() ? { failInterpretation: form.failInterpretation.trim() } : {}),
        ...(form.accessibilityNote.trim() ? { accessibilityNote: form.accessibilityNote.trim() } : {}),
        validationStatus: form.validationStatus as "unreviewed" | "validated",
      };
      if (initial) {
        await diagnosticsApi.updateStep(initial.id, payload);
      } else {
        await diagnosticsApi.addStep(workflowId, payload);
      }
      await onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSubmitting(false);
    }
  }

  async function applyTemplate(template: DiagnosticStepTemplate) {
    const next = templateToForm(template, meta);
    next.publicLabel = template.name;
    next.stepKey = slugifyPublicLabel(template.name);
    setKeyDirty(true);
    setError(null);
    setForm(next);
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {!initial && (
        <div className="rounded-xl border border-border bg-surface-200/60 p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-fg-muted">
            <Wand2 className="size-3.5" aria-hidden /> Quick templates
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {meta.stepTemplates.map((template) => (
              <button
                key={template.key}
                type="button"
                onClick={() => void applyTemplate(template)}
                className="rounded-full border border-border bg-surface-200 px-2.5 py-1 text-xs font-medium text-fg-muted transition-colors hover:border-primary hover:text-primary"
                title={template.description}
              >
                {template.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Technician label *</Label>
          <Input
            value={form.publicLabel}
            onChange={(event) => {
              const value = event.target.value;
              set("publicLabel", value);
              if (!keyDirty) set("stepKey", slugifyPublicLabel(value));
            }}
            placeholder="e.g. Measure evaporator fan winding"
            maxLength={140}
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Stable step key *</Label>
          <Input value={form.stepKey} onChange={(event) => { set("stepKey", event.target.value); setKeyDirty(true); }} placeholder="auto-suggested" />
          {duplicateKey && <p className="text-xs text-red">This key already exists in the workflow.</p>}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <VocabSelect
          label="Step type"
          options={["check", "decision", "reference", "stop"].map((value) => ({ value, label: value }))}
          value={form.stepType}
          custom=""
          onChange={(value) => set("stepType", value)}
          onCustomChange={() => {}}
        />
        <div>
          <Label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-fg-muted">Technician mode</Label>
          <FormSelect
            value={form.mode}
            onChange={(value) => set("mode", value)}
            options={[
              { value: "both", label: "Field + Guided" },
              { value: "field", label: "Field" },
              { value: "guided", label: "Guided" },
            ]}
          />
        </div>
        <VocabSelect
          label="Validation status"
          options={[
            { value: "unreviewed", label: "Unreviewed" },
            { value: "validated", label: "Validated" },
          ]}
          value={form.validationStatus}
          custom=""
          onChange={(value) => set("validationStatus", value)}
          onCustomChange={() => {}}
        />
      </div>

      {isCheck ? (
        <div className="space-y-4 rounded-xl border border-border bg-surface-200/50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Measurement</p>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <VocabSelect
              label="Meter / tool mode"
              options={meta.meterModes}
              value={form.meterMode}
              custom={form.meterModeCustom}
              onChange={(value) => set("meterMode", value)}
              onCustomChange={(value) => set("meterModeCustom", value)}
            />
            <VocabSelect
              label="Power state"
              options={meta.powerStates}
              value={form.powerState}
              custom={form.powerStateCustom}
              onChange={(value) => set("powerState", value)}
              onCustomChange={(value) => set("powerStateCustom", value)}
            />
            <VocabSelect
              label="Operating condition"
              options={meta.operatingConditions}
              value={form.operatingCondition}
              custom={form.operatingConditionCustom}
              onChange={(value) => set("operatingCondition", value)}
              onCustomChange={(value) => set("operatingConditionCustom", value)}
            />
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Point 1</Label>
              <Input value={form.point1Label} onChange={(event) => set("point1Label", event.target.value)} placeholder="Label, e.g. Fan lead red" />
              <Input value={form.point1Endpoint} onChange={(event) => set("point1Endpoint", event.target.value)} placeholder="Endpoint (e.g. J3-2)" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Point 2</Label>
              <Input value={form.point2Label} onChange={(event) => set("point2Label", event.target.value)} placeholder="Label, e.g. Fan lead black" />
              <Input value={form.point2Endpoint} onChange={(event) => set("point2Endpoint", event.target.value)} placeholder="Endpoint (e.g. neutral)" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Connector / pin / wire</Label>
              <Input value={form.connector} onChange={(event) => set("connector", event.target.value)} placeholder="Connector (e.g. J3)" />
              <div className="grid grid-cols-2 gap-2">
                <Input value={form.pin} onChange={(event) => set("pin", event.target.value)} placeholder="Pin" />
                <Input value={form.wireColor} onChange={(event) => set("wireColor", event.target.value)} placeholder="Wire color" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Expected result *</Label>
              <Input value={form.expectedText} onChange={(event) => set("expectedText", event.target.value)} placeholder="e.g. 10–15 Ω" />
            </div>
            <VocabSelect
              label="Unit"
              options={meta.units}
              value={form.unit}
              custom={form.unitCustom}
              onChange={(value) => set("unit", value)}
              onCustomChange={(value) => set("unitCustom", value)}
            />
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Pass interpretation</Label>
              <Input value={form.passInterpretation} onChange={(event) => set("passInterpretation", event.target.value)} placeholder="What a pass means" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Fail interpretation</Label>
              <Input value={form.failInterpretation} onChange={(event) => set("failInterpretation", event.target.value)} placeholder="What a fail means" />
            </div>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Purpose</Label>
            <Input
              value={form.purpose}
              onChange={(event) => set("purpose", event.target.value)}
              placeholder={form.stepType === "stop" ? "Why this workflow stops here" : "What this step accomplishes"}
            />
          </div>
          {form.stepType === "decision" && (
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Branch note</Label>
              <Input value={form.expectedText} onChange={(event) => set("expectedText", event.target.value)} placeholder="What outcome routes the technician where" />
            </div>
          )}
          {form.stepType === "stop" && (
            <div className="space-y-2 md:col-span-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Accessibility / safety note</Label>
              <Input value={form.accessibilityNote} onChange={(event) => set("accessibilityNote", event.target.value)} placeholder="e.g. Never bypass a safety interlock" />
            </div>
          )}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex items-center justify-between rounded-lg border border-border bg-surface-200 px-3 py-2.5">
          <Label className="text-sm font-medium text-fg">Step passes validation</Label>
          <Switch checked={form.validationStatus === "validated"} onCheckedChange={(checked) => set("validationStatus", checked ? "validated" : "unreviewed")} />
        </div>
        <div className="space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Accessibility note</Label>
          <Input value={form.accessibilityNote} onChange={(event) => set("accessibilityNote", event.target.value)} placeholder="Ergonomic or safety guidance" />
        </div>
      </div>

      {error && (
        <p className="rounded-lg border border-red/30 bg-red/5 p-3 text-sm text-red" role="alert">{error}</p>
      )}

      <div className="flex items-center gap-2">
        <Button
          type="submit"
          loading={submitting}
          disabled={!form.publicLabel.trim() || keyError || isCheck && !form.expectedText.trim()}
        >
          {initial ? "Save step" : "Add step"}
        </Button>
        {initial && (
          <Button type="button" variant="ghost" onClick={() => setForm(initial ? stepToForm(initial) : emptyStepForm())} disabled={submitting}>
            Reset
          </Button>
        )}
      </div>
    </form>
  );
}

// ── Route editor ───────────────────────────────────────────────────────

function RouteEditor({
  meta,
  step,
  initial,
  onSaved,
  onCancel,
}: {
  meta: DiagnosticMeta;
  step: DiagnosticStep;
  initial?: TraceRoute | null;
  onSaved: () => Promise<void>;
  onCancel?: () => void;
}) {
  const [label, setLabel] = useState(initial?.label ?? "");
  const [routeKind, setRouteKind] = useState(initial ? (meta.routeKinds.some((o) => o.value === initial.routeKind) ? initial.routeKind : CUSTOM_VALUE) : "");
  const [routeKindCustom, setRouteKindCustom] = useState(initial ? (meta.routeKinds.some((o) => o.value === initial.routeKind) ? "" : initial.routeKind) : "");
  const [endpoint1, setEndpoint1] = useState(initial?.endpoint1 ?? step.point1Endpoint ?? "");
  const [endpoint2, setEndpoint2] = useState(initial?.endpoint2 ?? step.point2Endpoint ?? "");
  const [segmentIds, setSegmentIds] = useState(initial?.segmentIds.join(", ") ?? "");
  const [continuityValid, setContinuityValid] = useState(initial?.continuityValid ?? false);
  const [disconnectedIslands, setDisconnectedIslands] = useState(String(initial?.disconnectedIslands ?? 0));
  const [unintendedBranches, setUnintendedBranches] = useState(String(initial?.unintendedBranches ?? 0));
  const [visualAuditStatus, setVisualAuditStatus] = useState(initial?.visualAuditStatus ?? "pending");
  const [validationNotes, setValidationNotes] = useState(initial?.validationNotes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const kindError = !routeKind || (routeKind === CUSTOM_VALUE && !routeKindCustom.trim());
  const gate = {
    continuity: continuityValid,
    islands: Number(disconnectedIslands) === 0,
    branches: Number(unintendedBranches) === 0,
    audit: visualAuditStatus === "passed",
  };
  const gatePassed = gate.continuity && gate.islands && gate.branches && gate.audit;
  const gateChecks: Array<{ key: keyof typeof gate; label: string; passed: boolean }> = [
    { key: "continuity", label: "Continuity validated", passed: gate.continuity },
    { key: "islands", label: "No disconnected islands", passed: gate.islands },
    { key: "branches", label: "No unintended branches", passed: gate.branches },
    { key: "audit", label: "Visual trace audit passed", passed: gate.audit },
  ];

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!label.trim() || kindError) return;
    setError(null);
    setSubmitting(true);
    try {
      const payload = {
        label: label.trim(),
        routeKind,
        ...(routeKind === CUSTOM_VALUE ? { routeKindLabel: routeKindCustom.trim() } : {}),
        endpoint1: endpoint1.trim() || undefined,
        endpoint2: endpoint2.trim() || undefined,
        segmentIds: segmentIds.split(",").map((value) => value.trim()).filter(Boolean),
        continuityValid,
        disconnectedIslands: Number(disconnectedIslands) || 0,
        unintendedBranches: Number(unintendedBranches) || 0,
        visualAuditStatus,
        validationNotes: validationNotes.trim() || undefined,
      };
      if (initial) {
        await diagnosticsApi.updateRoute(step.id, initial.id, payload);
      } else {
        await diagnosticsApi.addRoute(step.id, payload);
      }
      await onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <div className="space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Route label *</Label>
          <Input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="e.g. Line-to-neutral supply path" />
        </div>
        <VocabSelect
          label="Route kind"
          options={meta.routeKinds}
          value={routeKind}
          custom={routeKindCustom}
          onChange={setRouteKind}
          onCustomChange={setRouteKindCustom}
          placeholder="Select…"
        />
        <div className="space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Endpoint 1</Label>
          <Input value={endpoint1} onChange={(event) => setEndpoint1(event.target.value)} placeholder={step.point1Endpoint ?? "e.g. J1-1"} />
        </div>
        <div className="space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Endpoint 2</Label>
          <Input value={endpoint2} onChange={(event) => setEndpoint2(event.target.value)} placeholder={step.point2Endpoint ?? "e.g. neutral"} />
        </div>
        <div className="space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Segment IDs</Label>
          <Input value={segmentIds} onChange={(event) => setSegmentIds(event.target.value)} placeholder="Comma separated, e.g. W1, W2, J1-3" />
        </div>
        <div>
          <Label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-fg-muted">Visual trace audit</Label>
          <FormSelect
            value={visualAuditStatus}
            onChange={setVisualAuditStatus}
            options={[
              { value: "pending", label: "Pending" },
              { value: "passed", label: "Passed" },
              { value: "failed", label: "Failed" },
            ]}
          />
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-200 px-3 py-2 text-sm text-fg">
          <Switch checked={continuityValid} onCheckedChange={setContinuityValid} />
          <Label className="font-normal">Continuity validated</Label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Islands</Label>
            <Input type="number" min={0} value={disconnectedIslands} onChange={(event) => setDisconnectedIslands(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Branches</Label>
            <Input type="number" min={0} value={unintendedBranches} onChange={(event) => setUnintendedBranches(event.target.value)} />
          </div>
        </div>
        <div className="space-y-2 xl:col-span-2">
          <Label className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Validation notes</Label>
          <Input value={validationNotes} onChange={(event) => setValidationNotes(event.target.value)} placeholder="Evidence of the physical trace" />
        </div>
      </div>

      <div className="grid gap-1.5 rounded-xl border border-border bg-surface-200/50 p-3 text-xs">
        {gateChecks.map((check) => (
          <p key={check.key} className={cn("flex items-center gap-2", check.passed ? "text-green" : "text-fg-dim")}>
            {check.passed ? <Check className="size-3.5" aria-hidden /> : <X className="size-3.5" aria-hidden />}
            {check.label}
          </p>
        ))}
        {gatePassed && (
          <p className="mt-1 flex items-center gap-1.5 font-semibold text-green">
            <ShieldCheck className="size-3.5" aria-hidden /> Ready for publication
          </p>
        )}
      </div>

      {error && (
        <p className="rounded-lg border border-red/30 bg-red/5 p-3 text-sm text-red" role="alert">{error}</p>
      )}

      <div className="flex items-center gap-2">
        <Button type="submit" loading={submitting} disabled={!label.trim() || kindError}>
          {initial ? "Save route" : "Attach route evidence"}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>Cancel</Button>
        )}
      </div>
    </form>
  );
}

// ── Readiness panel ────────────────────────────────────────────────────

function ReadinessPanel({ readiness, loading, onPublish }: { readiness: ReadinessReport | null; loading: boolean; onPublish: () => void }) {
  if (loading && !readiness) {
    return (
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Publication readiness</CardTitle></CardHeader>
        <CardContent><Skeleton className="h-20 w-full" /></CardContent>
      </Card>
    );
  }
  if (!readiness) return null;

  const issuesByStep = new Map<string, string[]>();
  for (const issue of readiness.issues) {
    issuesByStep.set(issue.step, [...(issuesByStep.get(issue.step) ?? []), issue.message]);
  }

  return (
    <Card className="border-border">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <ListChecks className="size-4 text-fg-muted" aria-hidden /> Publication readiness
          </CardTitle>
          {readiness.publishable ? (
            <span className="flex items-center gap-1.5 rounded-full bg-green/10 px-2.5 py-1 text-xs font-semibold text-green">
              <Check className="size-3.5" aria-hidden /> Publishable
            </span>
          ) : (
            <span className="rounded-full bg-red/10 px-2.5 py-1 text-xs font-semibold text-red">
              {readiness.issues.length} issue{readiness.issues.length === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {readiness.publishable ? (
          <p className="flex items-start gap-2 rounded-lg bg-green/5 p-3 text-sm text-green">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
            All steps have validated labels, measurements, and trace routes. You can publish this workflow.
          </p>
        ) : (
          <>
            {[...issuesByStep.entries()].map(([step, messages]) => (
              <div key={step} className="rounded-lg border border-border bg-surface-200/60 p-3">
                <p className="flex items-start gap-2 text-sm font-medium text-fg">
                  <CircleAlert className="mt-0.5 size-4 shrink-0 text-red" aria-hidden /> {step}
                </p>
                <ul className="mt-1.5 space-y-1 pl-6">
                  {messages.map((message, index) => (
                    <li key={index} className="list-disc text-xs text-fg-muted">{message}</li>
                  ))}
                </ul>
              </div>
            ))}
          </>
        )}
        <Button onClick={onPublish} disabled={!readiness.publishable} className="w-full" loading={false}>
          <ShieldCheck className="size-4" aria-hidden /> Publish validated workflow
        </Button>
      </CardContent>
    </Card>
  );
}

// ── Step card ──────────────────────────────────────────────────────────

function StepCard({
  index,
  step,
  meta,
  editing,
  routeEditorOpen,
  onEdit,
  onDelete,
  onToggleRouteEditor,
  onSaved,
}: {
  index: number;
  step: DiagnosticStep;
  meta: DiagnosticMeta;
  editing: boolean;
  routeEditorOpen: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onToggleRouteEditor: () => void;
  onSaved: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <Card className="border-border">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-300 text-xs font-semibold text-fg-muted">{index}</span>
            <div>
              <CardTitle className="text-sm text-fg">{step.publicLabel}</CardTitle>
              <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className={cn("rounded-full px-2 py-0.5 capitalize", statusTone(step.validationStatus))}>{step.validationStatus}</span>
                <span className="rounded-full bg-surface-300 px-2 py-0.5 text-fg-muted">{step.mode}</span>
                <span className="rounded-full bg-surface-300 px-2 py-0.5 text-fg-muted">{step.stepType}</span>
                {step.stepKey && <span className="flex items-center gap-1 text-fg-dim"><Tag className="size-3" aria-hidden />{step.stepKey}</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button type="button" size="sm" variant="ghost" className="h-7 gap-1.5 text-fg-muted hover:text-fg" onClick={onEdit}>
              <Pencil className="size-3.5" aria-hidden /> {editing ? "Close" : "Edit"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 gap-1.5 text-fg-muted hover:text-fg"
              onClick={() => { setConfirming(true); onToggleRouteEditor(); }}
            >
              <Route className="size-3.5" aria-hidden /> {routeEditorOpen ? "Close route" : step.routes.length ? `${step.routes.length} route(s)` : "Attach route"}
            </Button>
            {confirming ? (
              <button
                type="button"
                className="h-7 rounded-md bg-red/10 px-2 text-xs font-semibold text-red"
                onClick={() => { setConfirming(false); onDelete(); }}
              >
                Confirm delete
              </button>
            ) : (
              <Button type="button" size="sm" variant="ghost" className="h-7 gap-1.5 text-red hover:bg-red/10 hover:text-red" onClick={() => setConfirming(true)}>
                <Trash2 className="size-3.5" aria-hidden />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {step.stepType === "check" ? (
          <div className="grid gap-2 text-xs sm:grid-cols-3">
            {[["Meter", optionLabel(meta.meterModes, step.meterMode) || step.meterMode], ["Point 1", step.point1Label], ["Point 2", step.point2Label], ["Power", optionLabel(meta.powerStates, step.powerState) || step.powerState], ["Operating", optionLabel(meta.operatingConditions, step.operatingCondition) || step.operatingCondition], ["Expected", step.expectedText], ["Unit", optionLabel(meta.units, step.unit) || step.unit], ["Connector", step.connector], ["Pin / wire", [step.pin, step.wireColor].filter(Boolean).join(" / ")]]
              .filter(([, value]) => value)
              .map(([field, value]) => (
                <span key={String(field)} className="rounded-lg bg-surface-100 p-2">
                  <span className="block text-[10px] font-semibold uppercase tracking-wide text-fg-dim">{field}</span>
                  <span className="text-fg">{value}</span>
                </span>
              ))}
          </div>
        ) : step.purpose ? (
          <p className="text-xs text-fg-muted">{step.purpose}</p>
        ) : null}

        {step.routes.length > 0 && !routeEditorOpen && (
          <div className="space-y-1.5">
            {step.routes.map((route) => (
              <div key={route.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-200/60 px-3 py-2 text-xs">
                <span className="font-medium text-fg">{route.label}</span>
                <span className="text-fg-muted">{optionLabel(meta.routeKinds, route.routeKind) || route.routeKind}</span>
                {route.continuityValid && <span className="text-green">✓ continuity</span>}
                {route.disconnectedIslands === 0 && route.unintendedBranches === 0 && <span className="text-green">✓ clean trace</span>}
                <span className={route.visualAuditStatus === "passed" ? "text-green" : "text-yellow"}>
                  {route.visualAuditStatus === "passed" ? "✓ visual audit passed" : "audit pending"}
                </span>
              </div>
            ))}
          </div>
        )}

        {routeEditorOpen && (
          <RouteEditor meta={meta} step={step} onSaved={onSaved} onCancel={onToggleRouteEditor} />
        )}
      </CardContent>
    </Card>
  );
}

// ── Page ────────────────────────────────────────────────────────────────

export default function DiagnosticLibraryPage() {
  const [meta, setMeta] = useState<DiagnosticMeta | null>(null);
  const [workflows, setWorkflows] = useState<DiagnosticWorkflow[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [workflow, setWorkflow] = useState<DiagnosticWorkflow | null>(null);
  const [steps, setSteps] = useState<DiagnosticStep[]>([]);
  const [readiness, setReadiness] = useState<ReadinessReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingWorkflow, setLoadingWorkflow] = useState(false);
  const [loadingReadiness, setLoadingReadiness] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [messageTimer, setMessageTimer] = useState<number | undefined>(undefined);

  const [createOpen, setCreateOpen] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState(false);
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [routeEditorStepId, setRouteEditorStepId] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  const flash = useCallback((tone: "success" | "error", text: string) => {
    window.clearTimeout(messageTimer);
    setMessage({ tone, text });
    const timer = window.setTimeout(() => setMessage(null), 6000);
    setMessageTimer(timer);
  }, [messageTimer]);

  useEffect(() => () => window.clearTimeout(messageTimer), [messageTimer]);

  const loadWorkflows = useCallback(async (preferredId?: string) => {
    const rows = await diagnosticsApi.workflows();
    setWorkflows(rows);
    const nextId = preferredId || selectedId || rows[0]?.id || "";
    if (nextId) {
      setSelectedId(nextId);
      await loadBundle(nextId, rows);
    } else {
      setSelectedId("");
      setWorkflow(null);
      setSteps([]);
      setReadiness(null);
    }
  }, [selectedId]);

  const loadBundle = useCallback(async (id: string, list?: DiagnosticWorkflow[]) => {
    setLoadingWorkflow(true);
    try {
      const bundle = await diagnosticsApi.workflow(id);
      setWorkflow(bundle.workflow);
      setSteps(bundle.steps);
      setSelectedId(id);
      if (list) setWorkflows(list);
      setLoadingReadiness(true);
      try {
        const report = await diagnosticsApi.readiness(id);
        setReadiness(report);
      } finally {
        setLoadingReadiness(false);
      }
      return bundle;
    } finally {
      setLoadingWorkflow(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [metaResponse] = await Promise.all([diagnosticsApi.meta(), diagnosticsApi.workflows()]);
        if (cancelled) return;
        setMeta(metaResponse);
      } catch (error) {
        if (!cancelled) flash("error", error instanceof Error ? error.message : String(error));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const existingKeys = useMemo(() => new Set(steps.map((step) => step.stepKey)), [steps]);

  async function refresh(id: string) {
    const bundle = await loadBundle(id);
    if (bundle) setMessage(null);
  }

  async function handleCreateWorkflow(payload: Parameters<typeof WorkflowForm.prototype> extends never ? never : { name: string; productType: string; productTypeLabel?: string; make?: string; modelFamily?: string; sourceRevision?: string; models: string[]; limitations: string[] }) {
    const created = await diagnosticsApi.createWorkflow({
      name: payload.name,
      productType: payload.productType,
      ...(payload.productTypeLabel ? { productTypeLabel: payload.productTypeLabel } : {}),
      make: payload.make || undefined,
      modelFamily: payload.modelFamily || undefined,
      sourceRevision: payload.sourceRevision || undefined,
      supportStatus: "experimental",
      lifecycleStatus: "draft",
      applicability: { models: payload.models },
      limitations: payload.limitations,
    });
    setCreateOpen(false);
    const rows = await diagnosticsApi.workflows();
    setWorkflows(rows);
    await loadBundle(created.id, rows);
    flash("success", "Draft workflow created. Add steps, then validation and trace routes before publication.");
  }

  async function handleUpdateWorkflow(payload: { name: string; productType: string; productTypeLabel?: string; make?: string; modelFamily?: string; sourceRevision?: string; models: string[]; limitations: string[] }) {
    if (!workflow) return;
    await diagnosticsApi.updateWorkflow(workflow.id, {
      name: payload.name,
      productType: payload.productType,
      ...(payload.productTypeLabel ? { productTypeLabel: payload.productTypeLabel } : {}),
      make: payload.make || null,
      modelFamily: payload.modelFamily || null,
      sourceRevision: payload.sourceRevision || null,
      applicability: { models: payload.models },
      limitations: payload.limitations,
    });
    setEditingWorkflow(false);
    await loadWorkflows(workflow.id);
    flash("success", "Workflow updated.");
  }

  async function handleDeleteWorkflow(id: string) {
    if (!window.confirm(`Permanently delete workflow "${workflows.find((w) => w.id === id)?.name ?? id}"?`)) return;
    setMessage(null);
  }

  async function afterSaved(id: string) {
    await refresh(id);
  }

  async function handlePublish() {
    if (!workflow) return;
    setPublishing(true);
    setMessage(null);
    try {
      await diagnosticsApi.publishWorkflow(workflow.id);
      await loadBundle(workflow.id);
      flash("success", "Workflow published as validated field content.");
    } catch (error) {
      flash("error", error instanceof Error ? error.message : String(error));
      await loadBundle(workflow.id);
    } finally {
      setPublishing(false);
    }
  }

  const editingStep = steps.find((step) => step.id === editingStepId) ?? null;
  const routeEditorStep = steps.find((step) => step.id === routeEditorStepId) ?? null;

  if (loading) {
    return (
      <div className="space-y-4">
        <PageHeader title="Diagnostic Library" description="Create, review, trace, and publish appliance workflows without bypassing the validation gate." />
        <Skeleton className="h-24 w-full" />
        <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
          <Skeleton className="h-96 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Diagnostic Library"
        description="Create, review, trace, and publish appliance workflows without bypassing the validation gate."
      />

      {message && (
        <p
          className={cn(
            "mb-5 flex items-start gap-2 rounded-xl border p-3 text-sm",
            message.tone === "success" ? "border-green/30 bg-green/5 text-green" : "border-red/30 bg-red/5 text-red",
          )}
          role={message.tone === "error" ? "alert" : "status"}
        >
          {message.tone === "error" ? <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> : <Check className="mt-0.5 size-4 shrink-0" aria-hidden />}
          {message.text}
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        {/* ── Workflow library ── */}
        <div className="space-y-4">
          <Card className="border-border">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Layers className="size-4 text-fg-muted" aria-hidden /> Workflows
                </CardTitle>
                <span className="rounded-full bg-surface-300 px-2 py-0.5 text-xs text-fg-muted">{workflows.length}</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button size="sm" className="w-full gap-1.5" onClick={() => setCreateOpen(true)}>
                <Plus className="size-3.5" aria-hidden /> New workflow
              </Button>
              {workflows.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-fg-muted">
                  No workflows yet. Create one to start authoring an appliance diagnostic.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {workflows.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => void loadBundle(item.id)}
                      className={cn(
                        "w-full rounded-xl border p-3 text-left transition-colors",
                        selectedId === item.id ? "border-primary bg-primary/10" : "border-border bg-surface-200 hover:border-fg-dim hover:bg-surface-300",
                      )}
                    >
                      <p className="truncate text-sm font-medium text-fg">{item.name}</p>
                      <p className="mt-0.5 truncate text-[11px] text-fg-dim">
                        {[optionLabel(meta?.productTypes ?? [], item.productType) || item.productType, item.make, item.modelFamily].filter(Boolean).join(" · ")}
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        <span className={cn("rounded-full px-2 py-0.5 text-[9px] font-semibold capitalize", statusTone(item.supportStatus))}>{item.supportStatus}</span>
                        <span className={cn("rounded-full px-2 py-0.5 text-[9px] font-semibold capitalize", statusTone(item.lifecycleStatus))}>{item.lifecycleStatus.replaceAll("_", " ")}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {createOpen && (
            <Card className="border-primary/40">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">New workflow</CardTitle>
                  <button type="button" onClick={() => setCreateOpen(false)} className="text-fg-muted hover:text-fg" aria-label="Close">
                    <X className="size-4" aria-hidden />
                  </button>
                </div>
              </CardHeader>
              <CardContent>
                {meta ? (
                  <WorkflowForm meta={meta} onSubmit={handleCreateWorkflow} submitLabel="Create draft" />
                ) : (
                  <Skeleton className="h-48 w-full" />
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* ── Workflow detail ── */}
        {workflow ? (
          <div className="min-w-0 space-y-4">
            {/* Workflow header */}
            <Card className="border-border">
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="text-lg text-fg">{workflow.name}</CardTitle>
                      <span className={cn("rounded-full px-2.5 py-0.5 text-[10px] font-semibold capitalize", statusTone(workflow.lifecycleStatus))}>{workflow.lifecycleStatus.replaceAll("_", " ")}</span>
                      <span className={cn("rounded-full px-2.5 py-0.5 text-[10px] font-semibold capitalize", statusTone(workflow.supportStatus))}>{workflow.supportStatus}</span>
                      {workflow.lifecycleStatus === "published" && (
                        <span className="flex items-center gap-1 rounded-full bg-green/10 px-2.5 py-0.5 text-[10px] font-semibold text-green">
                          <ShieldCheck className="size-3" aria-hidden /> Published
                        </span>
                      )}
                    </div>
                    <p className="mt-1.5 text-sm text-fg-muted">
                      {optionLabel(meta?.productTypes ?? [], workflow.productType) || workflow.productType}
                      {workflow.make ? ` · ${workflow.make}` : ""}
                      {workflow.modelFamily ? ` · ${workflow.modelFamily}` : ""}
                      <span className="text-fg-dim"> · V{workflow.versionNumber}</span>
                      {workflow.sourceRevision ? <span className="text-fg-dim"> · {workflow.sourceRevision}</span> : null}
                    </p>
                    {(workflow.applicability?.models?.length ?? 0) > 0 && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1">
                        <span className="text-[11px] text-fg-dim">Applies to:</span>
                        {workflow.applicability.models?.map((model) => (
                          <span key={model} className="rounded-full bg-surface-300 px-2 py-0.5 text-[11px] text-fg">{model}</span>
                        ))}
                      </div>
                    )}
                    {(workflow.limitations?.length ?? 0) > 0 && (
                      <p className="mt-1.5 text-xs text-fg-dim">Limitations: {workflow.limitations.join(" · ")}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => setEditingWorkflow((value) => !value)}>
                      <Pencil className="size-3.5" aria-hidden /> Edit
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setEditingWorkflow(false)} disabled={!editingWorkflow}>
                      Cancel
                    </Button>
                  </div>
                </div>
              </CardHeader>
              {editingWorkflow && meta && (
                <CardContent className="border-t border-border pt-4">
                  <WorkflowForm
                    meta={meta}
                    initial={workflow}
                    onSubmit={handleUpdateWorkflow}
                    submitLabel="Save changes"
                    onCancel={() => setEditingWorkflow(false)}
                  />
                </CardContent>
              )}
            </Card>

            {/* Readiness */}
            <ReadinessPanel readiness={readiness} loading={loadingReadiness} onPublish={() => void handlePublish()} />

            {publishing && (
              <p className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm text-primary">Publishing…</p>
            )}

            {/* Positive feedback: a validated step banner */}
            {steps.length > 0 && steps.every((step) => step.validationStatus === "validated") && (
              <p className="flex items-center gap-2 rounded-lg border border-green/30 bg-green/5 p-3 text-sm text-green">
                <ShieldCheck className="size-4" aria-hidden /> All steps validated — finish by attaching trace routes to each check.
              </p>
            )}

            {/* Steps */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-fg-muted">
                  <Wrench className="size-4" aria-hidden /> Diagnostic steps <span className="font-normal">({steps.length})</span>
                </h2>
                <Button size="sm" variant="outline" disabled={!!editingStepId || !!routeEditorStepId} onClick={() => setEditingStepId("__new__")}>
                  <Plus className="size-3.5" aria-hidden /> Add step
                </Button>
              </div>

              {loadingWorkflow ? (
                <div className="space-y-3">
                  <Skeleton className="h-28 w-full" />
                  <Skeleton className="h-28 w-full" />
                </div>
              ) : steps.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-8 text-center">
                  <Ban className="mx-auto size-8 text-fg-dim" aria-hidden />
                  <p className="mt-2 text-sm font-medium text-fg">No diagnostic steps yet</p>
                  <p className="mt-1 text-sm text-fg-muted">Use a template above to add a first step instantly, or author one from scratch.</p>
                </div>
              ) : (
                steps.map((step, index) => (
                  <div key={step.id} className="space-y-2">
                    <StepCard
                      index={index + 1}
                      step={step}
                      meta={meta ?? { productTypes: [], routeKinds: [], meterModes: [], powerStates: [], operatingConditions: [], units: [], stepTemplates: [] }}
                      editing={editingStepId === step.id}
                      routeEditorOpen={routeEditorStepId === step.id}
                      onEdit={() => setEditingStepId(editingStepId === step.id ? null : step.id)}
                      onDelete={() => void (async () => {
                        try {
                          await diagnosticsApi.deleteStep(step.id);
                          await refresh(workflow.id);
                          flash("success", `Deleted step "${step.publicLabel}".`);
                        } catch (error) {
                          flash("error", error instanceof Error ? error.message : String(error));
                        }
                      })()}
                      onToggleRouteEditor={() => setRouteEditorStepId(routeEditorStepId === step.id ? null : step.id)}
                      onSaved={async () => {
                        setEditingStepId(null);
                        setRouteEditorStepId(null);
                        await refresh(workflow.id);
                      }}
                    />
                    {editingStepId === step.id && (
                      <Card className="border-primary/40">
                        <CardHeader className="pb-2">
                          <div className="flex items-center justify-between">
                            <CardTitle className="flex items-center gap-2 text-sm">
                              <Pencil className="size-4 text-fg-muted" aria-hidden /> Edit step
                            </CardTitle>
                            <button type="button" onClick={() => setEditingStepId(null)} className="text-fg-muted hover:text-fg" aria-label="Close">
                              <X className="size-4" aria-hidden />
                            </button>
                          </div>
                        </CardHeader>
                        <CardContent>
                          {meta ? (
                            <StepEditor meta={meta} workflowId={workflow.id} existingKeys={[...existingKeys]} existingSequence={steps.length} initial={step} onSaved={() => refresh(workflow.id)} />
                          ) : null}
                        </CardContent>
                      </Card>
                    )}
                  </div>
                ))
              )}

              {meta && editingStepId === "__new__" && (
                <Card className="border-primary/40">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2 text-sm">
                        <Plus className="size-4 text-fg-muted" aria-hidden /> Add diagnostic step
                      </CardTitle>
                      <button type="button" onClick={() => setEditingStepId(null)} className="text-fg-muted hover:text-fg" aria-label="Close">
                        <X className="size-4" aria-hidden />
                      </button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <StepEditor
                      meta={meta}
                      workflowId={workflow.id}
                      existingKeys={[...existingKeys]}
                      existingSequence={steps.length}
                      onSaved={async () => {
                        setEditingStepId(null);
                        await refresh(workflow.id);
                        flash("success", "Step added.");
                      }}
                    />
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        ) : (
          <div className="flex min-h-72 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-surface-200/40 p-8 text-center">
            <Layers className="size-8 text-fg-dim" aria-hidden />
            <p className="font-medium text-fg">Select a workflow to start authoring</p>
            <p className="max-w-sm text-sm text-fg-muted">
              Choose a workflow on the left, or create a new one. Steps and trace routes must pass the validation gate before publication.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}