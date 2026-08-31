"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { diagnosticsApi } from "@/lib/diagnostics-api";
import {
  repairBrainApi,
  type JobRepairBrainContext,
  type SuggestedFault,
  type ProposalDraft,
} from "@/lib/repair-brain-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Button } from "@/components/ui/button";
import { FormSelect } from "@/components/ui/form-select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Input } from "@/components/ui/input";

const STEPS = [
  "Equipment",
  "Knowledge",
  "Diagnosis",
  "Measurements",
  "Repair",
  "Outcome",
  "Learn",
] as const;

const OUTCOMES = [
  "successful",
  "partial",
  "failed",
  "temporary_fix",
  "waiting_for_part",
  "customer_declined",
  "replacement_recommended",
  "unrepairable",
] as const;

type Outcome = (typeof OUTCOMES)[number];

interface Props {
  jobId: string;
  customerId: string;
  jobStatus: string;
  jobDescription?: string | null;
}

export function JobRepairBrainWorkflow({ jobId, customerId, jobStatus, jobDescription }: Props) {
  const router = useRouter();
  const [ctx, setCtx] = useState<JobRepairBrainContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeStep, setActiveStep] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [customerEquipment, setCustomerEquipment] = useState<Array<Record<string, unknown>>>([]);
  const [selectedEquipmentId, setSelectedEquipmentId] = useState("");

  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<Awaited<ReturnType<typeof repairBrainApi.search>> | null>(null);

  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [customSymptom, setCustomSymptom] = useState("");
  const [suggestedFaults, setSuggestedFaults] = useState<SuggestedFault[]>([]);
  const [selectedFaultId, setSelectedFaultId] = useState("");
  const [faultWorkflows, setFaultWorkflows] = useState<Array<{ id: string; name: string }>>([]);

  const [complaint, setComplaint] = useState(jobDescription ?? "");
  const [sessionId, setSessionId] = useState<string | null>(null);

  const [measParam, setMeasParam] = useState("");
  const [measValue, setMeasValue] = useState("");
  const [measUnit, setMeasUnit] = useState("Ω");
  const [measExpectedMin, setMeasExpectedMin] = useState("");
  const [measExpectedMax, setMeasExpectedMax] = useState("");

  const [whatWasDone, setWhatWasDone] = useState("");
  const [outcome, setOutcome] = useState<Outcome>("successful");
  const [isFailedAttempt, setIsFailedAttempt] = useState(false);
  const [conclusion, setConclusion] = useState("");
  const [selectedParts, setSelectedParts] = useState<Array<{ partName: string; oemPartNumber?: string; quantity: number }>>([]);

  const [teachNnact, setTeachNnact] = useState<boolean | null>(null);
  const [proposalDraft, setProposalDraft] = useState<ProposalDraft | null>(null);

  const refresh = useCallback(async () => {
    const data = await repairBrainApi.getJobContext(jobId);
    setCtx(data);
    const sessions = data.diagnosticSessions;
    if (sessions[0]?.id) setSessionId(sessions[0].id as string);
    if (sessions[0]?.knownFaultId) setSelectedFaultId(sessions[0].knownFaultId as string);
    if (sessions[0]?.customerComplaint) setComplaint(sessions[0].customerComplaint as string);
    if (data.equipment?.id) setSelectedEquipmentId(data.equipment.id as string);
    return data;
  }, [jobId]);

  useEffect(() => {
    Promise.all([refresh(), api.equipment(customerId ? { customerId } : undefined).catch(() => [])])
      .then(([, equip]) => setCustomerEquipment(equip as Array<Record<string, unknown>>))
      .catch(() => setCtx(null))
      .finally(() => setLoading(false));
  }, [refresh, customerId]);

  const equipment = ctx?.equipment;
  const model = ctx?.equipmentModel;

  useEffect(() => {
    if (!model?.id || selectedSymptoms.length === 0) {
      setSuggestedFaults([]);
      return;
    }
    repairBrainApi.suggestFaults(model.id, selectedSymptoms).then(setSuggestedFaults).catch(() => setSuggestedFaults([]));
  }, [model?.id, selectedSymptoms]);

  useEffect(() => {
    if (!selectedFaultId) {
      setFaultWorkflows([]);
      return;
    }
    repairBrainApi.getFaultWorkflows(selectedFaultId).then(setFaultWorkflows).catch(() => setFaultWorkflows([]));
  }, [selectedFaultId]);

  const partOptions = useMemo(() => {
    const modelParts = (ctx?.modelParts ?? []).map((p) => ({
      id: p.id,
      partName: p.partName,
      oemPartNumber: p.oemPartNumber ?? undefined,
      source: "model" as const,
    }));
    const catalog = (ctx?.catalogItems ?? []).map((c) => ({
      id: c.id,
      partName: c.name,
      oemPartNumber: undefined,
      source: "catalog" as const,
    }));
    return [...modelParts, ...catalog];
  }, [ctx]);

  async function linkEquipment() {
    if (!selectedEquipmentId) return;
    setBusy(true);
    setMessage(null);
    try {
      await diagnosticsApi.linkJobEquipment(jobId, selectedEquipmentId);
      await repairBrainApi.linkEquipmentModel(selectedEquipmentId);
      await refresh();
      setMessage("Equipment linked to job and model knowledge.");
      setActiveStep(1);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function runSearch() {
    if (searchQ.trim().length < 2) return;
    const results = await repairBrainApi.search(searchQ.trim());
    setSearchResults(results);
  }

  async function addCustomSymptom() {
    if (!customSymptom.trim()) return;
    try {
      await repairBrainApi.createSymptom(customSymptom.trim());
    } catch {
      /* may already exist */
    }
    setSelectedSymptoms((prev) =>
      prev.includes(customSymptom.trim()) ? prev : [...prev, customSymptom.trim()],
    );
    setCustomSymptom("");
  }

  async function startOrUpdateDiagnosis() {
    if (!selectedEquipmentId) {
      setMessage("Link equipment first.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      if (sessionId) {
        await diagnosticsApi.patchSession(sessionId, {
          customerComplaint: complaint || null,
          knownFaultId: selectedFaultId || null,
          equipmentModelId: model?.id || null,
        } as never);
      } else {
        const session = await diagnosticsApi.createSession({
          jobId,
          equipmentId: selectedEquipmentId,
          customerComplaint: complaint || undefined,
          knownFaultId: selectedFaultId || undefined,
          equipmentModelId: model?.id,
          workflowId: faultWorkflows[0]?.id,
        } as never);
        setSessionId(session.id);
      }
      await refresh();
      setMessage("Diagnostic session updated.");
      setActiveStep(3);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function launchWorkflow(workflowId: string) {
    if (!sessionId) {
      await startOrUpdateDiagnosis();
    }
    if (sessionId) {
      await diagnosticsApi.patchSession(sessionId, { workflowId } as never);
      router.push(`/diagnostics/${sessionId}`);
    }
  }

  function classifyMeasurementResult(
    observed: string,
    min?: string,
    max?: string,
  ): "pass" | "fail" | "within_range" | "out_of_range" | "unknown" {
    const v = parseFloat(observed);
    if (isNaN(v)) return "unknown";
    const lo = min ? parseFloat(min) : undefined;
    const hi = max ? parseFloat(max) : undefined;
    if (lo === undefined && hi === undefined) return "unknown";
    const inRange = (lo === undefined || v >= lo) && (hi === undefined || v <= hi);
    if (lo !== undefined && hi !== undefined) return inRange ? "within_range" : "out_of_range";
    return inRange ? "pass" : "fail";
  }

  async function recordMeasurement(e: React.FormEvent) {
    e.preventDefault();
    if (!measParam.trim()) return;
    setBusy(true);
    try {
      const result = classifyMeasurementResult(measValue, measExpectedMin, measExpectedMax);
      await repairBrainApi.createMeasurement({
        sessionId: sessionId ?? undefined,
        equipmentModelId: model?.id,
        parameter: measParam,
        observedValue: measValue,
        unit: measUnit,
        expectedMin: measExpectedMin || undefined,
        expectedMax: measExpectedMax || undefined,
        result,
      });
      setMeasParam("");
      setMeasValue("");
      await refresh();
      setMessage("Measurement recorded.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function recordOutcome(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedEquipmentId) return;
    setBusy(true);
    try {
      await repairBrainApi.createOutcome({
        jobId,
        equipmentId: selectedEquipmentId,
        equipmentModelId: model?.id,
        diagnosticSessionId: sessionId,
        knownFaultId: selectedFaultId || undefined,
        outcome,
        whatWasDone: whatWasDone || undefined,
        partsUsed: selectedParts,
        isFailedAttempt,
        conclusion: conclusion || undefined,
      });
      setWhatWasDone("");
      setConclusion("");
      setIsFailedAttempt(false);
      await refresh();
      setMessage(isFailedAttempt ? "Failed attempt recorded — valuable knowledge preserved." : "Repair outcome recorded.");
      setActiveStep(6);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function loadProposalDraft() {
    const draft = await repairBrainApi.getProposalDraft(jobId);
    setProposalDraft(draft);
  }

  async function submitProposal() {
    if (!proposalDraft) return;
    setBusy(true);
    try {
      await repairBrainApi.createProposal({
        ...proposalDraft,
        status: "proposed",
      });
      setMessage("Knowledge proposal submitted for review — not auto-verified.");
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-fg-muted">Loading field workflow…</CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-accent/30 overflow-hidden">
      <CardHeader className="pb-2 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="inline-flex items-center gap-1.5 text-base">
            Repair Brain — Field Workflow
            <InfoTip label="About Repair Brain workflow" side="right">
              Guided field diagnosis from equipment through outcome. Capture measurements, suggested faults, and learnings for future jobs.
            </InfoTip>
          </CardTitle>
          {model && (
            <Link href={`/repair-brain/models/${model.id}`} className="text-xs text-green shrink-0">
              Model →
            </Link>
          )}
        </div>
        <ToggleGroup
          type="single"
          value={String(activeStep)}
          onValueChange={(value) => value && setActiveStep(Number(value))}
          className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none"
          aria-label="Workflow steps"
        >
          {STEPS.map((label, i) => (
            <ToggleGroupItem
              key={label}
              value={String(i)}
              className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium data-[state=on]:bg-green data-[state=on]:text-white"
            >
              {i + 1}. {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </CardHeader>

      <CardContent className="space-y-4 pb-6">
        {message && (
          <p className="text-sm rounded-lg bg-surface-200 px-3 py-2 text-fg-muted">{message}</p>
        )}

        {/* Step 0: Equipment */}
        {(activeStep === 0 || !equipment) && (
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-fg">Equipment instance</h3>
            {equipment ? (
              <div className="rounded-xl border border-border bg-surface-200 p-3 text-sm">
                <p className="font-medium">
                  {[equipment.make, equipment.model].filter(Boolean).join(" ") || String(equipment.type)}
                </p>
                {equipment.serialNumber ? (
                  <p className="text-fg-muted text-xs mt-1">S/N {String(equipment.serialNumber)}</p>
                ) : null}
                {model ? (
                  <p className="text-green text-xs mt-2">
                    Model knowledge: {model.manufacturer} {model.modelNumber}
                  </p>
                ) : (
                  <Button size="sm" className="mt-2" disabled={busy} onClick={linkEquipment}>
                    Link to model knowledge
                  </Button>
                )}
              </div>
            ) : (
              <>
                <FormSelect
                  value={selectedEquipmentId}
                  onChange={setSelectedEquipmentId}
                  allowEmpty
                  placeholder="Select customer equipment…"
                  emptyLabel="Select customer equipment…"
                  options={customerEquipment.map((eq) => ({
                    value: String(eq.id),
                    label: `${[eq.make, eq.model, eq.type].filter(Boolean).join(" ")}${eq.serialNumber ? ` (${eq.serialNumber})` : ""}`,
                  }))}
                />
                <Button size="sm" className="w-full" disabled={busy || !selectedEquipmentId} onClick={linkEquipment}>
                  Link equipment to job
                </Button>
                <Link href={`/diagnostics/new?jobId=${jobId}`} className="block text-center text-xs text-fg-link">
                  Or register new equipment →
                </Link>
              </>
            )}
          </section>
        )}

        {/* Step 1: Model knowledge */}
        {activeStep === 1 && model && (
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-fg">Model knowledge — {model.manufacturer} {model.modelNumber}</h3>

            <div className="flex gap-2">
              <Input
                placeholder="Search faults, parts, procedures…"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                className="flex-1 text-sm"
              />
              <Button size="sm" variant="secondary" onClick={runSearch}>
                Search
              </Button>
            </div>
            {searchResults && (
              <div className="text-xs space-y-1 max-h-32 overflow-y-auto">
                {searchResults.faults.map((f) => (
                  <div key={f.id} className="text-fg-muted">Fault: {f.title}</div>
                ))}
                {searchResults.parts.map((p) => (
                  <div key={p.id} className="text-fg-muted">Part: {p.partName}</div>
                ))}
              </div>
            )}

            <div>
              <p className="text-xs font-medium text-fg-muted mb-2">Known faults ({ctx?.knownFaults.length ?? 0})</p>
              <div className="space-y-2">
                {(ctx?.knownFaults ?? []).slice(0, 5).map((f) => (
                  <Button
                    key={f.id}
                    type="button"
                    variant="secondary"
                    className="h-auto w-full justify-start rounded-lg p-2.5 text-left text-sm"
                    onClick={() => { setSelectedFaultId(f.id); setActiveStep(2); }}
                  >
                    <span className="font-medium">{f.title}</span>
                    {f.faultCode && <span className="text-fg-muted ml-2">({f.faultCode})</span>}
                    <span className="block text-[10px] text-fg-dim capitalize mt-0.5">{f.confidenceStatus.replaceAll("_", " ")}</span>
                  </Button>
                ))}
              </div>
            </div>

            {ctx?.repairStats && ctx.repairStats.totalRepairs > 0 && (
              <div className="rounded-lg bg-surface-200 p-3 text-xs">
                <p className="font-medium">Previous repairs on this model</p>
                <p className="text-fg-muted mt-1">
                  {ctx.repairStats.totalRepairs} cases · {ctx.repairStats.successfulRepairs} successful · avg {ctx.repairStats.averageLaborMinutes} min
                </p>
              </div>
            )}
          </section>
        )}

        {activeStep === 1 && !model && (
          <p className="text-sm text-fg-muted">Link equipment to a model to see institutional knowledge.</p>
        )}

        {/* Step 2: Diagnosis */}
        {activeStep === 2 && (
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-fg">Diagnosis</h3>
            <Input
              placeholder="Customer complaint"
              value={complaint}
              onChange={(e) => setComplaint(e.target.value)}
              className="text-sm"
            />

            <div>
              <p className="text-xs text-fg-muted mb-2">Symptoms (tap to select)</p>
              <ToggleGroup
                type="multiple"
                value={selectedSymptoms}
                onValueChange={setSelectedSymptoms}
                className="flex flex-wrap gap-1.5"
                aria-label="Symptoms"
              >
                {(ctx?.availableSymptoms ?? []).slice(0, 12).map((s) => (
                  <ToggleGroupItem
                    key={s.id}
                    value={s.label}
                    className="rounded-full px-2.5 py-1 text-[11px] data-[state=on]:border-green data-[state=on]:bg-green/10 data-[state=on]:text-green"
                  >
                    {s.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <div className="flex gap-2 mt-2">
                <Input
                  placeholder="Add symptom…"
                  value={customSymptom}
                  onChange={(e) => setCustomSymptom(e.target.value)}
                  className="text-sm flex-1"
                />
                <Button size="sm" variant="secondary" onClick={addCustomSymptom}>
                  Add
                </Button>
              </div>
            </div>

            {suggestedFaults.length > 0 && (
              <div>
                <p className="text-xs text-fg-muted mb-2">Suggested faults (symptom match)</p>
                {suggestedFaults.map((f) => (
                  <Button
                    key={f.faultId}
                    type="button"
                    variant={selectedFaultId === f.faultId ? "default" : "secondary"}
                    className="mb-2 h-auto w-full justify-start rounded-lg p-2.5 text-left text-sm"
                    onClick={() => setSelectedFaultId(f.faultId)}
                  >
                    <span className="font-medium">{f.title}</span>
                    <span className="text-fg-dim text-xs ml-2">score {f.score}</span>
                  </Button>
                ))}
              </div>
            )}

            {selectedFaultId && faultWorkflows.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-fg-muted">Launch diagnostic workflow</p>
                {faultWorkflows.map((w) => (
                  <Button key={w.id} size="sm" variant="secondary" className="w-full" onClick={() => launchWorkflow(w.id)}>
                    {w.name}
                  </Button>
                ))}
              </div>
            )}

            {sessionId && (
              <Link href={`/diagnostics/${sessionId}`}>
                <Button size="sm" variant="secondary" className="w-full">
                  Open full diagnostic session →
                </Button>
              </Link>
            )}

            <Button size="sm" className="w-full" disabled={busy} onClick={startOrUpdateDiagnosis}>
              Save diagnosis & continue
            </Button>
          </section>
        )}

        {/* Step 3: Measurements */}
        {activeStep === 3 && (
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-fg">Field measurements</h3>
            <form onSubmit={recordMeasurement} className="space-y-2">
              <Input placeholder="Parameter (e.g. Drain pump resistance)" value={measParam} onChange={(e) => setMeasParam(e.target.value)} className="text-sm" />
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Expected min" value={measExpectedMin} onChange={(e) => setMeasExpectedMin(e.target.value)} className="text-sm" />
                <Input placeholder="Expected max" value={measExpectedMax} onChange={(e) => setMeasExpectedMax(e.target.value)} className="text-sm" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Input placeholder="Observed" value={measValue} onChange={(e) => setMeasValue(e.target.value)} className="text-sm col-span-2" />
                <Input placeholder="Unit" value={measUnit} onChange={(e) => setMeasUnit(e.target.value)} className="text-sm" />
              </div>
              <Button type="submit" size="sm" className="w-full" disabled={busy}>
                Record measurement
              </Button>
            </form>
            {(ctx?.fieldMeasurements ?? []).length > 0 && (
              <div className="space-y-1">
                {ctx!.fieldMeasurements.slice(0, 5).map((m) => {
                  const r = String(m.result ?? "");
                  const tone = r === "pass" || r === "within_range"
                    ? "bg-green/10 text-green"
                    : r === "fail" || r === "out_of_range"
                      ? "bg-red/10 text-red"
                      : "bg-surface-400 text-fg-muted";
                  return (
                    <div key={String(m.id)} className="flex items-center justify-between text-xs rounded bg-surface-200 px-2 py-1.5">
                      <span>{String(m.parameter)}: {String(m.observedValue ?? "—")} {String(m.unit ?? "")}</span>
                      <span className={`rounded px-1.5 py-0.5 font-medium ${tone}`}>
                        {r ? r.replaceAll("_", " ") : "—"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* Step 4: Repair + parts */}
        {activeStep === 4 && (
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-fg">Repair & parts</h3>
            <Input placeholder="What was done" value={whatWasDone} onChange={(e) => setWhatWasDone(e.target.value)} className="text-sm" />

            <div>
              <p className="text-xs text-fg-muted mb-2">Parts used</p>
              <ToggleGroup
                type="multiple"
                value={selectedParts.map((p) => p.partName)}
                onValueChange={(values) => {
                  setSelectedParts((prev) =>
                    values.map((partName) => {
                      const existing = prev.find((p) => p.partName === partName);
                      if (existing) return existing;
                      const option = partOptions.find((p) => p.partName === partName);
                      return option
                        ? { partName: option.partName, oemPartNumber: option.oemPartNumber, quantity: 1 }
                        : { partName, quantity: 1 };
                    }),
                  );
                }}
                className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto"
                aria-label="Parts used"
              >
                {partOptions.map((p) => (
                  <ToggleGroupItem
                    key={`${p.source}-${p.id}`}
                    value={p.partName}
                    className="rounded-full px-2.5 py-1 text-[11px] data-[state=on]:border-green data-[state=on]:bg-green/10 data-[state=on]:text-green"
                  >
                    {p.partName}
                    {p.oemPartNumber ? ` (${p.oemPartNumber})` : ""}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="failed-attempt"
                checked={isFailedAttempt}
                onCheckedChange={setIsFailedAttempt}
              />
              <Label htmlFor="failed-attempt" className="text-sm font-normal">
                This was an unsuccessful attempt (still valuable knowledge)
              </Label>
            </div>
          </section>
        )}

        {/* Step 5: Outcome */}
        {activeStep === 5 && (
          <section className="space-y-3" data-tour="job-detail-outcome">
            <h3 className="text-sm font-semibold text-fg">Repair outcome</h3>
            <FormSelect
              value={outcome}
              onChange={(value) => setOutcome(value as Outcome)}
              options={OUTCOMES.map((o) => ({
                value: o,
                label: o.replaceAll("_", " "),
              }))}
            />
            <Input placeholder="Conclusion" value={conclusion} onChange={(e) => setConclusion(e.target.value)} className="text-sm" />

            {(ctx?.repairOutcomes ?? []).length > 0 && (
              <div>
                <p className="text-xs text-fg-muted mb-1">Attempts on this job</p>
                {ctx!.repairOutcomes.map((o) => (
                  <div key={String(o.id)} className="text-xs rounded bg-surface-200 px-2 py-1.5 mb-1">
                    <span className="capitalize">{String(o.outcome).replaceAll("_", " ")}</span>
                    {o.isFailedAttempt ? <span className="text-yellow ml-1">· failed attempt</span> : null}
                    {o.whatWasDone ? <span className="text-fg-muted block">{String(o.whatWasDone)}</span> : null}
                  </div>
                ))}
              </div>
            )}

            <Button size="sm" className="w-full" disabled={busy} onClick={recordOutcome}>
              Record outcome
            </Button>
          </section>
        )}

        {/* Step 6: Knowledge proposal */}
        {activeStep === 6 && (
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-fg">Did this job teach NNACT something reusable?</h3>
            {jobStatus === "completed" || (ctx?.repairOutcomes.length ?? 0) > 0 ? (
              <>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={teachNnact === true ? "default" : "secondary"}
                    className="flex-1"
                    onClick={() => { setTeachNnact(true); loadProposalDraft(); }}
                  >
                    Yes — propose knowledge
                  </Button>
                  <Button size="sm" variant={teachNnact === false ? "default" : "secondary"} className="flex-1" onClick={() => setTeachNnact(false)}>
                    No
                  </Button>
                </div>
                {teachNnact && proposalDraft && (
                  <div className="rounded-lg border border-border p-3 text-sm space-y-2">
                    <p className="font-medium">{proposalDraft.title}</p>
                    <p className="text-xs text-fg-muted capitalize">Type: {proposalDraft.proposalType.replaceAll("_", " ")}</p>
                    <p className="text-xs text-yellow">Submitted as PROPOSED — requires review before becoming verified knowledge.</p>
                    <Button size="sm" className="w-full" disabled={busy} onClick={submitProposal}>
                      Submit knowledge proposal
                    </Button>
                  </div>
                )}
                {(ctx?.knowledgeProposals.length ?? 0) > 0 && (
                  <p className="text-xs text-fg-muted">
                    {ctx!.knowledgeProposals.length} proposal(s) already submitted for this job.
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-fg-muted">Record a repair outcome first, then propose reusable knowledge.</p>
            )}
          </section>
        )}

        <div className="flex gap-2 pt-2 border-t border-border">
          {activeStep > 0 && (
            <Button size="sm" variant="secondary" className="flex-1" onClick={() => setActiveStep((s) => s - 1)}>
              Back
            </Button>
          )}
          {activeStep < STEPS.length - 1 && (
            <Button size="sm" className="flex-1" onClick={() => setActiveStep((s) => s + 1)}>
              Next
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
