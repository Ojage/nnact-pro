"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { diagnosticsApi, type DiagnosticSessionDetail, type DiagnosticStep } from "@/lib/diagnostics-api";
import { Button } from "@/components/ui/button";
import { FormSelect } from "@/components/ui/form-select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

function humanize(value: string) {
  return value.replaceAll("_", " ");
}

function measurementFor(detail: DiagnosticSessionDetail, stepId: string) {
  return [...detail.measurements].reverse().find((measurement) => measurement.stepId === stepId);
}

function StepButton({
  step,
  active,
  completed,
  onClick,
}: {
  step: DiagnosticStep;
  active: boolean;
  completed: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onClick}
      className={`h-auto w-full justify-start rounded-xl border p-3 text-left ${
        active
          ? "border-accent bg-accent/10 hover:bg-accent/10"
          : completed
            ? "border-green/30 bg-green/5 hover:bg-green/10"
            : "border-border bg-surface-200 hover:bg-surface-300"
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
            completed ? "bg-green/15 text-green" : active ? "bg-accent text-white" : "bg-surface-400 text-fg-muted"
          }`}
        >
          {completed ? "✓" : step.sequence + 1}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-fg">{step.publicLabel}</p>
          <p className="mt-1 text-[11px] capitalize text-fg-dim">
            {humanize(step.stepType)} · {humanize(step.mode)}
          </p>
        </div>
      </div>
    </Button>
  );
}

export function DiagnosticSessionClient({ initialDetail }: { initialDetail: DiagnosticSessionDetail }) {
  const router = useRouter();
  const [detail, setDetail] = useState(initialDetail);
  const [mode, setMode] = useState<"field" | "guided">("guided");
  const availableSteps = useMemo(
    () => detail.steps.filter((step) => step.mode === "both" || step.mode === mode),
    [detail.steps, mode],
  );
  const [activeStepId, setActiveStepId] = useState(availableSteps[0]?.id ?? "");
  const activeStep = availableSteps.find((step) => step.id === activeStepId) ?? availableSteps[0];
  const [valueText, setValueText] = useState("");
  const [result, setResult] = useState<
    "pass" | "fail" | "within_range" | "out_of_range" | "unable" | "not_reproduced"
  >("pass");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [correctionCategory, setCorrectionCategory] = useState("field_usability");
  const [correctionSeverity, setCorrectionSeverity] = useState<"low" | "medium" | "high" | "safety_critical">("medium");
  const [correctionDescription, setCorrectionDescription] = useState("");

  async function refresh() {
    const next = await diagnosticsApi.session(detail.session.id);
    setDetail(next);
    return next;
  }

  async function recordMeasurement(event: React.FormEvent) {
    event.preventDefault();
    if (!activeStep) return;
    setSaving(true);
    setMessage(null);
    try {
      await diagnosticsApi.recordMeasurement(detail.session.id, {
        stepId: activeStep.id,
        valueText: valueText || undefined,
        unit: activeStep.unit || undefined,
        result,
        note: note || undefined,
        ...(result === "unable" ? { unableReason: note || "Meter point could not be accessed" } : {}),
      });
      const next = await refresh();
      setValueText("");
      setNote("");
      setMessage("Reading recorded. The session history now contains the actual field result.");
      const currentIndex = availableSteps.findIndex((step) => step.id === activeStep.id);
      const nextStep = availableSteps[currentIndex + 1];
      if (nextStep && !measurementFor(next, nextStep.id)) setActiveStepId(nextStep.id);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }

  async function setDisposition(status: "diagnosed" | "inconclusive" | "escalated" | "completed") {
    setSaving(true);
    try {
      await diagnosticsApi.patchSession(detail.session.id, {
        status,
        disposition:
          status === "diagnosed"
            ? "Repair recommendation supported by recorded diagnostic evidence"
            : status === "inconclusive"
              ? "Condition could not be isolated responsibly"
              : status === "escalated"
                ? "Technical escalation required"
                : detail.session.disposition,
      });
      await refresh();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function reportCorrection(event: React.FormEvent) {
    event.preventDefault();
    if (!detail.workflow || !correctionDescription.trim()) return;
    setSaving(true);
    try {
      await diagnosticsApi.reportCorrection({
        workflowId: detail.workflow.id,
        workflowVersion: detail.session.workflowVersion ?? detail.workflow.versionNumber,
        sessionId: detail.session.id,
        stepId: activeStep?.id,
        category: correctionCategory,
        severity: correctionSeverity,
        description: correctionDescription,
      });
      setCorrectionOpen(false);
      setCorrectionDescription("");
      setMessage(
        correctionSeverity === "safety_critical"
          ? "Safety-critical correction reported. The affected workflow is suspended pending review."
          : "Correction reported for technical review.",
      );
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }

  if (!detail.workflow) {
    return (
      <Card className="border-yellow/30 bg-yellow/5">
        <CardHeader><CardTitle>Coverage required</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-fg-muted">
            This appliance is linked to the work order, but no validated workflow applies. NNACT Pro will not generate an unreviewed field path or imply a part diagnosis.
          </p>
          <div className="rounded-xl border border-border bg-surface-200 p-4 text-sm">
            <p className="font-semibold text-fg">Required fallback</p>
            <p className="mt-1 text-fg-muted">Use the applicable OEM service information, document the tests performed, and submit this model family as a coverage request.</p>
          </div>
          <Button variant="secondary" onClick={() => setDisposition("escalated")}>Escalate unsupported case</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-200 p-3">
        <ToggleGroup
          type="single"
          value={mode}
          onValueChange={(value) => {
            if (!value) return;
            const next = value as "guided" | "field";
            setMode(next);
            const first = detail.steps.find((step) => step.mode === "both" || step.mode === next);
            if (first) setActiveStepId(first.id);
          }}
          className="gap-1 rounded-lg bg-surface-100 p-1"
        >
          {(["guided", "field"] as const).map((item) => (
            <ToggleGroupItem
              key={item}
              value={item}
              className="rounded-md px-3 py-1.5 text-xs capitalize data-[state=on]:bg-accent data-[state=on]:text-white"
            >
              {item} mode
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => setCorrectionOpen((open) => !open)}>
            Report workflow issue
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setDisposition("inconclusive")}>Inconclusive</Button>
          <Button variant="secondary" size="sm" onClick={() => setDisposition("escalated")}>Escalate</Button>
          <Button size="sm" onClick={() => setDisposition("diagnosed")}>Mark diagnosed</Button>
        </div>
      </div>

      {message && (
        <div className="rounded-xl border border-border bg-surface-200 p-3 text-sm text-fg-muted">{message}</div>
      )}

      {correctionOpen && (
        <Card className="border-yellow/30">
          <CardHeader><CardTitle>Report a workflow defect</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={reportCorrection} className="grid gap-3 md:grid-cols-[.7fr_.7fr_1.6fr_auto]">
              <FormSelect
                value={correctionCategory}
                onChange={setCorrectionCategory}
                options={[
                  { value: "endpoint_resolution", label: "Endpoint resolution" },
                  { value: "trace_route", label: "Trace route" },
                  { value: "expected_reading", label: "Expected reading" },
                  { value: "operating_condition", label: "Operating condition" },
                  { value: "branch_logic", label: "Branch logic" },
                  { value: "field_usability", label: "Field usability" },
                  { value: "part_recommendation", label: "Part recommendation" },
                ]}
              />
              <FormSelect
                value={correctionSeverity}
                onChange={(value) => setCorrectionSeverity(value as typeof correctionSeverity)}
                options={[
                  { value: "low", label: "Low" },
                  { value: "medium", label: "Medium" },
                  { value: "high", label: "High" },
                  { value: "safety_critical", label: "Safety critical" },
                ]}
              />
              <Input
                value={correctionDescription}
                onChange={(event) => setCorrectionDescription(event.target.value)}
                placeholder="Describe what is wrong and what the field evidence shows"
                required
              />
              <Button type="submit" disabled={saving}>Submit</Button>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)_420px]">
        <Card className="h-fit xl:sticky xl:top-6">
          <CardHeader>
            <CardTitle>{mode === "guided" ? "Diagnostic tree" : "Direct field checks"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {availableSteps.length === 0 ? (
              <p className="text-sm text-fg-muted">No {mode} steps are published for this workflow.</p>
            ) : (
              availableSteps.map((step) => (
                <StepButton
                  key={step.id}
                  step={step}
                  active={activeStep?.id === step.id}
                  completed={Boolean(measurementFor(detail, step.id))}
                  onClick={() => setActiveStepId(step.id)}
                />
              ))
            )}
          </CardContent>
        </Card>

        {activeStep ? (
          <div className="space-y-5">
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-accent">Active check</p>
                    <CardTitle className="mt-1">{activeStep.publicLabel}</CardTitle>
                    {activeStep.purpose && <p className="mt-2 text-sm text-fg-muted">{activeStep.purpose}</p>}
                  </div>
                  <span className="rounded-full border border-border bg-surface-300 px-2.5 py-1 text-[11px] font-semibold capitalize text-fg-muted">
                    {activeStep.validationStatus}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                {(activeStep.safetyState || activeStep.powerState) && (
                  <div className="rounded-xl border border-yellow/30 bg-yellow/5 p-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-yellow">Safety and power state</p>
                    <p className="mt-2 text-sm text-fg">
                      {[activeStep.safetyState, activeStep.powerState].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    ["Meter / tool", activeStep.meterMode],
                    ["Operating condition", activeStep.operatingCondition],
                    ["Point 1", activeStep.point1Label],
                    ["Point 2", activeStep.point2Label],
                    ["Connector / pin", [activeStep.connector, activeStep.pin].filter(Boolean).join(" · ")],
                    ["Wire color", activeStep.wireColor],
                    ["Expected", activeStep.expectedText],
                    ["Accessibility", activeStep.accessibilityNote],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl border border-border bg-surface-200 p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-fg-dim">{label}</p>
                      <p className="mt-1 text-sm font-medium text-fg">{value || "Not specified"}</p>
                    </div>
                  ))}
                </div>

                <form onSubmit={recordMeasurement} className="rounded-xl border border-accent/30 bg-accent/5 p-4" data-tour="diag-run">
                  <p className="font-semibold text-fg">Record actual result</p>
                  <p className="mt-1 text-xs text-fg-muted">The workflow does not branch until a real field result is stored.</p>
                  <div className="mt-4 grid gap-3 md:grid-cols-[1fr_.8fr_1.3fr_auto]">
                    <Input
                      value={valueText}
                      onChange={(event) => setValueText(event.target.value)}
                      placeholder={activeStep.expectedText ? `Expected: ${activeStep.expectedText}` : "Measured value"}
                    />
                    <FormSelect
                      value={result}
                      onChange={(value) => setResult(value as typeof result)}
                      options={[
                        { value: "pass", label: "Pass" },
                        { value: "fail", label: "Fail" },
                        { value: "within_range", label: "Within range" },
                        { value: "out_of_range", label: "Out of range" },
                        { value: "unable", label: "Unable to access" },
                        { value: "not_reproduced", label: "Condition not reproduced" },
                      ]}
                    />
                    <Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Field note or access limitation" />
                    <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Record"}</Button>
                  </div>
                </form>

                {(activeStep.passInterpretation || activeStep.failInterpretation) && (
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-xl border border-green/30 bg-green/5 p-3">
                      <p className="text-xs font-semibold uppercase text-green">Pass means</p>
                      <p className="mt-1 text-sm text-fg-muted">{activeStep.passInterpretation || "Continue according to the branch rule."}</p>
                    </div>
                    <div className="rounded-xl border border-red/30 bg-red/5 p-3">
                      <p className="text-xs font-semibold uppercase text-red">Fail means</p>
                      <p className="mt-1 text-sm text-fg-muted">{activeStep.failInterpretation || "Isolate the failed portion before recommending a component."}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        ) : (
          <Card><CardContent className="p-8 text-center text-sm text-fg-muted">No executable steps are available.</CardContent></Card>
        )}

        <div className="space-y-5">
          <Card>
            <CardHeader><CardTitle>Wiring evidence</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {!activeStep || activeStep.routes.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-fg-muted">
                  No validated route is attached to this step.
                </div>
              ) : (
                activeStep.routes.map((route) => (
                  <div key={route.id} className="rounded-xl border border-border bg-surface-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-fg">{route.label}</p>
                        <p className="mt-1 text-xs text-fg-muted capitalize">{humanize(route.routeKind)}</p>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${
                        route.continuityValid && route.visualAuditStatus === "passed"
                          ? "bg-green/10 text-green"
                          : "bg-yellow/10 text-yellow"
                      }`}>
                        {route.continuityValid && route.visualAuditStatus === "passed" ? "validated" : "review required"}
                      </span>
                    </div>
                    <div className="mt-3 rounded-lg bg-surface-100 p-3 font-mono text-xs text-fg-muted">
                      <p>{route.endpoint1 || activeStep.point1Label || "Point 1"}</p>
                      <p className="my-1 text-accent">↓ {route.segmentIds.length} selectable segment(s)</p>
                      <p>{route.endpoint2 || activeStep.point2Label || "Point 2"}</p>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[10px] text-fg-dim">
                      <span>Islands: {route.disconnectedIslands}</span>
                      <span>Branches: {route.unintendedBranches}</span>
                      <span>Visual: {route.visualAuditStatus}</span>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Recorded evidence</CardTitle></CardHeader>
            <CardContent>
              {detail.measurements.length === 0 ? (
                <p className="text-sm text-fg-muted">No readings recorded yet.</p>
              ) : (
                <div className="space-y-2">
                  {detail.measurements.map((measurement) => {
                    const step = detail.steps.find((item) => item.id === measurement.stepId);
                    return (
                      <div key={measurement.id} className="rounded-lg border border-border bg-surface-200 p-3">
                        <p className="text-xs font-semibold text-fg">{step?.publicLabel || "Diagnostic check"}</p>
                        <p className="mt-1 text-sm text-fg-muted">
                          {[measurement.valueText, measurement.unit].filter(Boolean).join(" ") || humanize(measurement.result)}
                          {measurement.valueText ? ` · ${humanize(measurement.result)}` : ""}
                        </p>
                        {measurement.note && <p className="mt-1 text-xs text-fg-dim">{measurement.note}</p>}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
