"use client";

import { useEffect, useMemo, useState } from "react";
import { diagnosticsApi, type DiagnosticStep, type DiagnosticWorkflow } from "@/lib/diagnostics-api";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface WorkflowBundle {
  workflow: DiagnosticWorkflow;
  steps: DiagnosticStep[];
}

function statusTone(status: string) {
  if (["published", "validated"].includes(status)) return "bg-green/10 text-green";
  if (["suspended", "unsupported"].includes(status)) return "bg-red/10 text-red";
  if (["pilot", "experimental"].includes(status)) return "bg-yellow/10 text-yellow";
  return "bg-surface-400 text-fg-muted";
}

export default function DiagnosticLibraryPage() {
  const [workflows, setWorkflows] = useState<DiagnosticWorkflow[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [bundle, setBundle] = useState<WorkflowBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [workflowForm, setWorkflowForm] = useState({
    name: "",
    productType: "refrigerator",
    make: "",
    modelFamily: "",
    sourceRevision: "",
    models: "",
    limitations: "",
  });

  const [stepForm, setStepForm] = useState({
    stepKey: "",
    publicLabel: "",
    mode: "both" as "field" | "guided" | "both",
    stepType: "check" as "check" | "decision" | "reference" | "stop",
    purpose: "",
    safetyState: "",
    powerState: "",
    operatingCondition: "",
    meterMode: "",
    point1Label: "",
    point1Endpoint: "",
    point2Label: "",
    point2Endpoint: "",
    connector: "",
    pin: "",
    wireColor: "",
    expectedText: "",
    unit: "",
    passInterpretation: "",
    failInterpretation: "",
    accessibilityNote: "",
    sourceDocument: "",
    sourcePage: "",
    validationStatus: "unreviewed",
  });

  const [routeForm, setRouteForm] = useState({
    stepId: "",
    label: "",
    routeKind: "source_path",
    endpoint1: "",
    endpoint2: "",
    segmentIds: "",
    continuityValid: false,
    disconnectedIslands: "0",
    unintendedBranches: "0",
    visualAuditStatus: "pending",
    validationNotes: "",
  });

  async function loadWorkflows(preferredId?: string) {
    const rows = await diagnosticsApi.workflows();
    setWorkflows(rows);
    const nextId = preferredId || selectedId || rows[0]?.id || "";
    setSelectedId(nextId);
    if (nextId) setBundle(await diagnosticsApi.workflow(nextId));
    else setBundle(null);
  }

  useEffect(() => {
    loadWorkflows()
      .catch((error) => setMessage(error instanceof Error ? error.message : String(error)))
      .finally(() => setLoading(false));
    // Initial load only. Selection changes are handled explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedStep = useMemo(
    () => bundle?.steps.find((step) => step.id === routeForm.stepId) ?? null,
    [bundle, routeForm.stepId],
  );

  async function selectWorkflow(id: string) {
    setSelectedId(id);
    setMessage(null);
    setBundle(await diagnosticsApi.workflow(id));
    setRouteForm((current) => ({ ...current, stepId: "" }));
  }

  async function createWorkflow(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const created = await diagnosticsApi.createWorkflow({
        name: workflowForm.name,
        productType: workflowForm.productType,
        make: workflowForm.make || undefined,
        modelFamily: workflowForm.modelFamily || undefined,
        sourceRevision: workflowForm.sourceRevision || undefined,
        supportStatus: "experimental",
        lifecycleStatus: "draft",
        applicability: {
          models: workflowForm.models.split(",").map((value) => value.trim()).filter(Boolean),
        },
        limitations: workflowForm.limitations.split("\n").map((value) => value.trim()).filter(Boolean),
      });
      setWorkflowForm({
        name: "",
        productType: "refrigerator",
        make: "",
        modelFamily: "",
        sourceRevision: "",
        models: "",
        limitations: "",
      });
      await loadWorkflows(created.id);
      setMessage("Draft workflow created. Add field-ready steps and validated routes before publication.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  async function addStep(event: React.FormEvent) {
    event.preventDefault();
    if (!bundle) return;
    setSaving(true);
    setMessage(null);
    try {
      await diagnosticsApi.addStep(bundle.workflow.id, {
        stepKey: stepForm.stepKey,
        publicLabel: stepForm.publicLabel,
        sequence: bundle.steps.length,
        mode: stepForm.mode,
        stepType: stepForm.stepType,
        purpose: stepForm.purpose || undefined,
        safetyState: stepForm.safetyState || undefined,
        powerState: stepForm.powerState || undefined,
        operatingCondition: stepForm.operatingCondition || undefined,
        meterMode: stepForm.meterMode || undefined,
        point1Label: stepForm.point1Label || undefined,
        point1Endpoint: stepForm.point1Endpoint || undefined,
        point2Label: stepForm.point2Label || undefined,
        point2Endpoint: stepForm.point2Endpoint || undefined,
        connector: stepForm.connector || undefined,
        pin: stepForm.pin || undefined,
        wireColor: stepForm.wireColor || undefined,
        expectedText: stepForm.expectedText || undefined,
        unit: stepForm.unit || undefined,
        passInterpretation: stepForm.passInterpretation || undefined,
        failInterpretation: stepForm.failInterpretation || undefined,
        accessibilityNote: stepForm.accessibilityNote || undefined,
        sourceRefs: stepForm.sourceDocument
          ? [{
              document: stepForm.sourceDocument,
              ...(stepForm.sourcePage ? { page: Number(stepForm.sourcePage) } : {}),
              revision: bundle.workflow.sourceRevision || undefined,
            }]
          : [],
        validationStatus: stepForm.validationStatus,
      });
      setBundle(await diagnosticsApi.workflow(bundle.workflow.id));
      setStepForm((current) => ({
        ...current,
        stepKey: "",
        publicLabel: "",
        purpose: "",
        safetyState: "",
        powerState: "",
        operatingCondition: "",
        meterMode: "",
        point1Label: "",
        point1Endpoint: "",
        point2Label: "",
        point2Endpoint: "",
        connector: "",
        pin: "",
        wireColor: "",
        expectedText: "",
        unit: "",
        passInterpretation: "",
        failInterpretation: "",
        accessibilityNote: "",
        sourceDocument: "",
        sourcePage: "",
        validationStatus: "unreviewed",
      }));
      setMessage("Diagnostic step added. Validation remains explicit and independent of content entry.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  async function addRoute(event: React.FormEvent) {
    event.preventDefault();
    if (!routeForm.stepId || !bundle) return;
    setSaving(true);
    setMessage(null);
    try {
      await diagnosticsApi.addRoute(routeForm.stepId, {
        label: routeForm.label,
        routeKind: routeForm.routeKind,
        endpoint1: routeForm.endpoint1 || undefined,
        endpoint2: routeForm.endpoint2 || undefined,
        segmentIds: routeForm.segmentIds.split(",").map((value) => value.trim()).filter(Boolean),
        continuityValid: routeForm.continuityValid,
        disconnectedIslands: Number(routeForm.disconnectedIslands) || 0,
        unintendedBranches: Number(routeForm.unintendedBranches) || 0,
        visualAuditStatus: routeForm.visualAuditStatus,
        validationNotes: routeForm.validationNotes || undefined,
      });
      setBundle(await diagnosticsApi.workflow(bundle.workflow.id));
      setRouteForm((current) => ({
        ...current,
        label: "",
        endpoint1: "",
        endpoint2: "",
        segmentIds: "",
        continuityValid: false,
        disconnectedIslands: "0",
        unintendedBranches: "0",
        visualAuditStatus: "pending",
        validationNotes: "",
      }));
      setMessage("Route evidence attached. Publication still requires continuity, zero islands/branches, and a passed visual audit.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    if (!bundle) return;
    setSaving(true);
    setMessage(null);
    try {
      await diagnosticsApi.publishWorkflow(bundle.workflow.id);
      await loadWorkflows(bundle.workflow.id);
      setMessage("Workflow published as validated field content.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Diagnostic Library"
        description="Create, review, trace, and publish appliance workflows without bypassing the validation gate."
        actions={bundle ? <Button onClick={publish} disabled={saving}>Publish validated workflow</Button> : undefined}
      />

      {message && (
        <p className="mb-5 rounded-xl border border-border bg-surface-200 p-3 text-sm text-fg-muted">{message}</p>
      )}

      <div className="grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Workflows</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {loading ? (
                <p className="text-sm text-fg-muted">Loading library…</p>
              ) : workflows.length === 0 ? (
                <p className="text-sm text-fg-muted">No workflows yet.</p>
              ) : (
                workflows.map((workflow) => (
                  <button
                    key={workflow.id}
                    type="button"
                    onClick={() => void selectWorkflow(workflow.id)}
                    className={`w-full rounded-xl border p-3 text-left ${selectedId === workflow.id ? "border-accent bg-accent/10" : "border-border bg-surface-200 hover:bg-surface-300"}`}
                  >
                    <p className="text-sm font-semibold text-fg">{workflow.name}</p>
                    <p className="mt-1 text-[11px] text-fg-dim">{[workflow.make, workflow.modelFamily].filter(Boolean).join(" · ") || workflow.productType}</p>
                    <div className="mt-2 flex gap-1.5">
                      <span className={`rounded-full px-2 py-1 text-[9px] font-semibold capitalize ${statusTone(workflow.supportStatus)}`}>{workflow.supportStatus}</span>
                      <span className={`rounded-full px-2 py-1 text-[9px] font-semibold capitalize ${statusTone(workflow.lifecycleStatus)}`}>{workflow.lifecycleStatus.replaceAll("_", " ")}</span>
                    </div>
                  </button>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>New workflow</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={createWorkflow} className="space-y-3">
                <Input value={workflowForm.name} onChange={(event) => setWorkflowForm({ ...workflowForm, name: event.target.value })} placeholder="Workflow name" required />
                <Input value={workflowForm.productType} onChange={(event) => setWorkflowForm({ ...workflowForm, productType: event.target.value })} placeholder="Product type" required />
                <Input value={workflowForm.make} onChange={(event) => setWorkflowForm({ ...workflowForm, make: event.target.value })} placeholder="Make" />
                <Input value={workflowForm.modelFamily} onChange={(event) => setWorkflowForm({ ...workflowForm, modelFamily: event.target.value })} placeholder="Model family" />
                <Input value={workflowForm.sourceRevision} onChange={(event) => setWorkflowForm({ ...workflowForm, sourceRevision: event.target.value })} placeholder="Source revision" />
                <Input value={workflowForm.models} onChange={(event) => setWorkflowForm({ ...workflowForm, models: event.target.value })} placeholder="Applicable models, comma separated" />
                <textarea value={workflowForm.limitations} onChange={(event) => setWorkflowForm({ ...workflowForm, limitations: event.target.value })} rows={3} placeholder="Known limitations, one per line" className="w-full rounded-lg border border-border bg-surface-200 px-3 py-2 text-sm text-fg" />
                <Button type="submit" disabled={saving}>Create draft</Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {bundle ? (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle>{bundle.workflow.name}</CardTitle>
                    <p className="mt-1 text-sm text-fg-muted">{bundle.workflow.productType} · Version {bundle.workflow.versionNumber} · Source {bundle.workflow.sourceRevision || "not recorded"}</p>
                  </div>
                  <div className="flex gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold capitalize ${statusTone(bundle.workflow.supportStatus)}`}>{bundle.workflow.supportStatus}</span>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold capitalize ${statusTone(bundle.workflow.lifecycleStatus)}`}>{bundle.workflow.lifecycleStatus.replaceAll("_", " ")}</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {bundle.steps.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-fg-muted">No diagnostic steps yet.</p>
                ) : (
                  <div className="space-y-3">
                    {bundle.steps.map((step) => (
                      <div key={step.id} className="rounded-xl border border-border bg-surface-200 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-fg">{step.sequence + 1}. {step.publicLabel}</p>
                            <p className="mt-1 text-xs capitalize text-fg-dim">{step.mode} · {step.stepType} · {step.validationStatus}</p>
                          </div>
                          <Button type="button" variant="secondary" size="sm" onClick={() => setRouteForm((current) => ({ ...current, stepId: step.id, endpoint1: step.point1Endpoint || "", endpoint2: step.point2Endpoint || "" }))}>Attach route</Button>
                        </div>
                        {step.stepType === "check" && (
                          <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
                            <span className="rounded-lg bg-surface-100 p-2 text-fg-muted">{step.point1Label || "Point 1 missing"}</span>
                            <span className="rounded-lg bg-surface-100 p-2 text-fg-muted">{step.point2Label || "Point 2 missing"}</span>
                            <span className="rounded-lg bg-surface-100 p-2 text-fg-muted">{step.expectedText || "Expected result missing"}</span>
                          </div>
                        )}
                        <p className="mt-3 text-xs text-fg-dim">{step.routes.length} route(s) attached</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Add diagnostic step</CardTitle></CardHeader>
              <CardContent>
                <form onSubmit={addStep} className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <Input value={stepForm.stepKey} onChange={(event) => setStepForm({ ...stepForm, stepKey: event.target.value })} placeholder="Stable step key" required />
                  <Input value={stepForm.publicLabel} onChange={(event) => setStepForm({ ...stepForm, publicLabel: event.target.value })} placeholder="Technician-facing label" required />
                  <select value={stepForm.mode} onChange={(event) => setStepForm({ ...stepForm, mode: event.target.value as typeof stepForm.mode })} className="rounded-lg border border-border bg-surface-200 px-3 py-2 text-sm text-fg"><option value="both">Field + Guided</option><option value="field">Field</option><option value="guided">Guided</option></select>
                  <select value={stepForm.stepType} onChange={(event) => setStepForm({ ...stepForm, stepType: event.target.value as typeof stepForm.stepType })} className="rounded-lg border border-border bg-surface-200 px-3 py-2 text-sm text-fg"><option value="check">Check</option><option value="decision">Decision</option><option value="reference">Reference</option><option value="stop">Stop</option></select>
                  <Input value={stepForm.purpose} onChange={(event) => setStepForm({ ...stepForm, purpose: event.target.value })} placeholder="Purpose" />
                  <Input value={stepForm.safetyState} onChange={(event) => setStepForm({ ...stepForm, safetyState: event.target.value })} placeholder="Safety state" />
                  <Input value={stepForm.powerState} onChange={(event) => setStepForm({ ...stepForm, powerState: event.target.value })} placeholder="Power state" />
                  <Input value={stepForm.operatingCondition} onChange={(event) => setStepForm({ ...stepForm, operatingCondition: event.target.value })} placeholder="Operating condition" />
                  <Input value={stepForm.meterMode} onChange={(event) => setStepForm({ ...stepForm, meterMode: event.target.value })} placeholder="Meter / tool mode" />
                  <Input value={stepForm.point1Label} onChange={(event) => setStepForm({ ...stepForm, point1Label: event.target.value })} placeholder="Point 1 label" />
                  <Input value={stepForm.point1Endpoint} onChange={(event) => setStepForm({ ...stepForm, point1Endpoint: event.target.value })} placeholder="Point 1 endpoint" />
                  <Input value={stepForm.point2Label} onChange={(event) => setStepForm({ ...stepForm, point2Label: event.target.value })} placeholder="Point 2 label" />
                  <Input value={stepForm.point2Endpoint} onChange={(event) => setStepForm({ ...stepForm, point2Endpoint: event.target.value })} placeholder="Point 2 endpoint" />
                  <Input value={stepForm.connector} onChange={(event) => setStepForm({ ...stepForm, connector: event.target.value })} placeholder="Connector" />
                  <Input value={stepForm.pin} onChange={(event) => setStepForm({ ...stepForm, pin: event.target.value })} placeholder="Pin(s)" />
                  <Input value={stepForm.wireColor} onChange={(event) => setStepForm({ ...stepForm, wireColor: event.target.value })} placeholder="Wire color" />
                  <Input value={stepForm.expectedText} onChange={(event) => setStepForm({ ...stepForm, expectedText: event.target.value })} placeholder="Expected result" />
                  <Input value={stepForm.unit} onChange={(event) => setStepForm({ ...stepForm, unit: event.target.value })} placeholder="Unit" />
                  <Input value={stepForm.passInterpretation} onChange={(event) => setStepForm({ ...stepForm, passInterpretation: event.target.value })} placeholder="Pass interpretation" />
                  <Input value={stepForm.failInterpretation} onChange={(event) => setStepForm({ ...stepForm, failInterpretation: event.target.value })} placeholder="Fail interpretation" />
                  <Input value={stepForm.accessibilityNote} onChange={(event) => setStepForm({ ...stepForm, accessibilityNote: event.target.value })} placeholder="Accessibility note" />
                  <Input value={stepForm.sourceDocument} onChange={(event) => setStepForm({ ...stepForm, sourceDocument: event.target.value })} placeholder="Source document" />
                  <Input value={stepForm.sourcePage} onChange={(event) => setStepForm({ ...stepForm, sourcePage: event.target.value })} placeholder="Source page" />
                  <select value={stepForm.validationStatus} onChange={(event) => setStepForm({ ...stepForm, validationStatus: event.target.value })} className="rounded-lg border border-border bg-surface-200 px-3 py-2 text-sm text-fg"><option value="unreviewed">Unreviewed</option><option value="validated">Validated</option></select>
                  <Button type="submit" disabled={saving}>Add step</Button>
                </form>
              </CardContent>
            </Card>

            {routeForm.stepId && (
              <Card className="border-blue/25">
                <CardHeader><CardTitle>Attach route to {selectedStep?.publicLabel || "selected step"}</CardTitle></CardHeader>
                <CardContent>
                  <form onSubmit={addRoute} className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <Input value={routeForm.label} onChange={(event) => setRouteForm({ ...routeForm, label: event.target.value })} placeholder="Technician route label" required />
                    <Input value={routeForm.routeKind} onChange={(event) => setRouteForm({ ...routeForm, routeKind: event.target.value })} placeholder="Route kind" required />
                    <Input value={routeForm.endpoint1} onChange={(event) => setRouteForm({ ...routeForm, endpoint1: event.target.value })} placeholder="Endpoint 1" />
                    <Input value={routeForm.endpoint2} onChange={(event) => setRouteForm({ ...routeForm, endpoint2: event.target.value })} placeholder="Endpoint 2" />
                    <Input value={routeForm.segmentIds} onChange={(event) => setRouteForm({ ...routeForm, segmentIds: event.target.value })} placeholder="Actual segment IDs, comma separated" />
                    <Input value={routeForm.disconnectedIslands} onChange={(event) => setRouteForm({ ...routeForm, disconnectedIslands: event.target.value })} placeholder="Disconnected islands" />
                    <Input value={routeForm.unintendedBranches} onChange={(event) => setRouteForm({ ...routeForm, unintendedBranches: event.target.value })} placeholder="Unintended branches" />
                    <select value={routeForm.visualAuditStatus} onChange={(event) => setRouteForm({ ...routeForm, visualAuditStatus: event.target.value })} className="rounded-lg border border-border bg-surface-200 px-3 py-2 text-sm text-fg"><option value="pending">Visual audit pending</option><option value="passed">Visual audit passed</option><option value="failed">Visual audit failed</option></select>
                    <label className="flex items-center gap-2 rounded-lg border border-border bg-surface-200 px-3 py-2 text-sm text-fg"><input type="checkbox" checked={routeForm.continuityValid} onChange={(event) => setRouteForm({ ...routeForm, continuityValid: event.target.checked })} /> Continuity validated</label>
                    <Input value={routeForm.validationNotes} onChange={(event) => setRouteForm({ ...routeForm, validationNotes: event.target.value })} placeholder="Validation notes" />
                    <Button type="submit" disabled={saving}>Attach route evidence</Button>
                  </form>
                </CardContent>
              </Card>
            )}
          </div>
        ) : (
          <Card><CardContent className="p-10 text-center text-sm text-fg-muted">Create or select a workflow to begin authoring.</CardContent></Card>
        )}
      </div>
    </div>
  );
}
