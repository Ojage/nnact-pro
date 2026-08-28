"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { diagnosticsApi, type DiagnosticWorkflow } from "@/lib/diagnostics-api";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FormSelect } from "@/components/ui/form-select";
import { InfoTip } from "@/components/ui/info-tip";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

type Jobs = Awaited<ReturnType<typeof api.jobs>>;
type Equipment = Awaited<ReturnType<typeof api.equipment>>;

export default function NewDiagnosticPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const presetJobId = searchParams.get("jobId") ?? "";
  const [jobs, setJobs] = useState<Jobs>([]);
  const [equipment, setEquipment] = useState<Equipment>([]);
  const [workflows, setWorkflows] = useState<DiagnosticWorkflow[]>([]);
  const [jobId, setJobId] = useState(presetJobId);
  const [equipmentId, setEquipmentId] = useState("");
  const [workflowId, setWorkflowId] = useState("");
  const [complaint, setComplaint] = useState("");
  const [observation, setObservation] = useState("");
  const [errorCodes, setErrorCodes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.jobs(), api.equipment(), diagnosticsApi.workflows()])
      .then(([jobRows, equipmentRows, workflowRows]) => {
        if (cancelled) return;
        setJobs(jobRows);
        setEquipment(equipmentRows);
        setWorkflows(
          workflowRows.filter(
            (workflow) =>
              workflow.lifecycleStatus === "published" ||
              workflow.lifecycleStatus === "pilot" ||
              workflow.supportStatus === "experimental",
          ),
        );
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : String(caught)))
      .finally(() => setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedJob = useMemo(() => jobs.find((job) => job.id === jobId), [jobs, jobId]);
  const eligibleEquipment = useMemo(() => {
    if (!selectedJob) return equipment;
    return equipment.filter((item) => item.customerId === selectedJob.customerId);
  }, [equipment, selectedJob]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!jobId || !equipmentId) {
      setError("Select a job and the exact appliance before starting diagnostics.");
      return;
    }

    setSaving(true);
    try {
      const session = await diagnosticsApi.createSession({
        jobId,
        equipmentId,
        ...(workflowId ? { workflowId } : {}),
        customerComplaint: complaint || undefined,
        technicianObservation: observation || undefined,
        errorCodes: errorCodes
          .split(",")
          .map((code) => code.trim())
          .filter(Boolean),
      });
      router.push(`/diagnostics/${session.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Start diagnostic"
        description="Bind the work order to the exact appliance and applicable workflow before testing."
        actions={
          <Link href="/diagnostics">
            <Button variant="secondary" size="sm">Cancel</Button>
          </Link>
        }
      />

      <form onSubmit={submit} className="grid gap-6 xl:grid-cols-[1fr_.72fr]">
        <Card>
          <CardHeader><CardTitle>Field intake</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            {loading ? (
              <p className="text-sm text-fg-muted">Loading jobs, appliances, and workflows…</p>
            ) : (
              <>
                <div>
                  <Label htmlFor="diagnostic-job" className="mb-2 block text-xs font-semibold uppercase tracking-wide text-fg-muted">Assigned job</Label>
                  <FormSelect
                    id="diagnostic-job"
                    value={jobId}
                    onChange={(value) => {
                      setJobId(value);
                      setEquipmentId("");
                    }}
                    allowEmpty
                    placeholder="Select a job"
                    emptyLabel="Select a job"
                    options={jobs
                      .filter((job) => !["completed", "canceled"].includes(job.status))
                      .map((job) => ({
                        value: job.id,
                        label: `${job.title} · ${job.status.replaceAll("_", " ")}`,
                      }))}
                  />
                </div>

                <div>
                  <Label htmlFor="diagnostic-equipment" className="mb-2 block text-xs font-semibold uppercase tracking-wide text-fg-muted">Exact appliance</Label>
                  <FormSelect
                    id="diagnostic-equipment"
                    value={equipmentId}
                    onChange={setEquipmentId}
                    allowEmpty
                    placeholder="Select model and serial"
                    emptyLabel="Select model and serial"
                    disabled={!jobId}
                    options={eligibleEquipment.map((item) => ({
                      value: item.id,
                      label:
                        [item.make, item.model, item.serialNumber && `S/N ${item.serialNumber}`]
                          .filter(Boolean)
                          .join(" · ") || item.type,
                    }))}
                  />
                  {jobId && eligibleEquipment.length === 0 && (
                    <span className="mt-2 block text-xs text-yellow">
                      No appliance record is attached to this customer. Add equipment from the customer profile first.
                    </span>
                  )}
                </div>

                <div>
                  <Label htmlFor="diagnostic-workflow" className="mb-2 block text-xs font-semibold uppercase tracking-wide text-fg-muted">Validated workflow</Label>
                  <FormSelect
                    id="diagnostic-workflow"
                    value={workflowId}
                    onChange={setWorkflowId}
                    allowEmpty
                    placeholder="No matching workflow — mark identification/coverage required"
                    emptyLabel="No matching workflow — mark identification/coverage required"
                    options={workflows.map((workflow) => ({
                      value: workflow.id,
                      label: `${workflow.name} · ${workflow.supportStatus} · v${workflow.versionNumber}`,
                    }))}
                  />
                  <span className="mt-1 flex items-center gap-1.5 text-xs text-fg-dim">
                    <InfoTip label="About workflow status" side="top">"Published" workflows are fully validated. "Pilot" and "experimental" workflows are usable but must stay visibly labeled during field use.</InfoTip>
                    Published, pilot, and experimental workflows appear here.
                  </span>
                </div>

                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-fg-muted">Customer-reported complaint</span>
                  <textarea
                    value={complaint}
                    onChange={(event) => setComplaint(event.target.value)}
                    rows={3}
                    placeholder="What did the customer report, in their words?"
                    className="w-full rounded-lg border border-border bg-surface-200 px-3 py-2.5 text-sm text-fg placeholder:text-fg-dim"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-fg-muted">Technician observation</span>
                  <textarea
                    value={observation}
                    onChange={(event) => setObservation(event.target.value)}
                    rows={3}
                    placeholder="What is actively observed at the unit?"
                    className="w-full rounded-lg border border-border bg-surface-200 px-3 py-2.5 text-sm text-fg placeholder:text-fg-dim"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-fg-muted">Error codes</span>
                  <Input
                    value={errorCodes}
                    onChange={(event) => setErrorCodes(event.target.value)}
                    placeholder="F6E0, F2E1"
                  />
                  <span className="mt-1 block text-xs text-fg-dim">Separate multiple codes with commas.</span>
                </label>
              </>
            )}

            {error && <p className="rounded-lg border border-red/30 bg-red/5 p-3 text-sm text-red">{error}</p>}

            <Button type="submit" disabled={saving || loading || !jobId || !equipmentId}>
              {saving ? "Starting…" : workflowId ? "Start validated workflow" : "Create unresolved session"}
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Applicability gate</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm text-fg-muted">
              <p>The model and serial must be confirmed before a workflow is treated as applicable.</p>
              <p>A missing workflow is not an error. It creates an explicit coverage-required state.</p>
              <p>Experimental and pilot workflows must remain visibly labeled during field use.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Safety boundary</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-fg-muted">
                NNACT Pro supports qualified technicians. The active check must still define power state,
                operating condition, meter mode, exact points, and stop conditions.
              </p>
            </CardContent>
          </Card>
        </div>
      </form>
    </div>
  );
}
