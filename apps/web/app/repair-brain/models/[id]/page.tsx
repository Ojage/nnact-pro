"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  AlertCircle,
  Check,
  ChevronRight,
  Clock,
  Gauge,
  ListChecks,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Badge } from "@/components/ui/badge";
import { AddKnowledgeButton } from "@/components/repair-brain/add-knowledge-dialog";
import { ModelInsightsPanel, ModelInsightsView } from "@/components/repair-brain/model-insights-panel";
import {
  EditProcedureButton,
  AddProcedureButton,
} from "@/components/repair-brain/procedure-editor-dialog";
import { EditModelButton } from "@/components/repair-brain/edit-model-dialog";
import { RateButton } from "@/components/repair-brain/rate-widget";
import { useRepairBrainKnowledgeGapsQuery, useRepairBrainModelProfileQuery } from "@/lib/redux/api";

type Tab =
  | "overview"
  | "faults"
  | "diagnostics"
  | "repairs"
  | "parts"
  | "documents"
  | "testPoints"
  | "history";

function confidenceBadge(status: string) {
  const tones: Record<string, string> = {
    verified: "bg-green/10 text-green",
    senior_verified: "bg-green/10 text-green",
    repeated_success: "bg-blue/10 text-blue",
    field_observation: "bg-yellow/10 text-yellow",
    unverified: "bg-surface-400 text-fg-muted",
  };
  return tones[status] ?? "bg-surface-400 text-fg-muted";
}

function coverageScore(profile: {
  faults: unknown[];
  repairProcedures: unknown[];
  testPoints: unknown[];
  parts: unknown[];
  documents: unknown[];
}) {
  const total = profile.faults.length;
  if (total === 0) return null;
  let covered = 0;
  for (const f of profile.faults) {
    const fault = f as Record<string, unknown>;
    const hasProcedure = profile.repairProcedures.some(
      (p) => (p as Record<string, unknown>).id === fault.id,
    );
    const hasTestPoint = profile.testPoints.length > 0;
    if (hasProcedure || hasTestPoint) covered++;
  }
  return Math.round((covered / total) * 100);
}

export default function EquipmentModelProfilePage() {
  const params = useParams();
  const id = params.id as string;
  const {
    data: profile,
    isLoading: loading,
    error,
  } = useRepairBrainModelProfileQuery(id);
  const [tab, setTab] = useState<Tab>("overview");

  if (loading) return <div className="p-8 text-fg-muted">Loading model knowledge…</div>;
  if (error || !profile) {
    return (
      <div className="p-8">
        <p className="text-red flex items-center gap-2">
          <AlertCircle className="size-4" />
          Failed to load model: {error ? "server error" : "not found"}
        </p>
        <Link href="/repair-brain">
          <Button variant="secondary" size="sm" className="mt-4">
            Back to Repair Brain
          </Button>
        </Link>
      </div>
    );
  }

  const { model } = profile;
  const coverage = coverageScore(profile);
  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "overview", label: "Overview" },
    { key: "faults", label: "Known Faults", count: profile.faults.length },
    { key: "diagnostics", label: "Diagnostics", count: profile.diagnosticWorkflows.length },
    { key: "repairs", label: "Repair Procedures", count: profile.repairProcedures.length },
    { key: "parts", label: "Parts", count: profile.parts.length },
    { key: "documents", label: "Documents", count: profile.documents.length },
    { key: "testPoints", label: "Test Points", count: profile.testPoints.length },
    { key: "history", label: "Previous Repairs" },
  ];

  return (
    <div>
      <PageHeader
        title={`${model.manufacturer} ${model.modelNumber}`}
        description={model.modelName ?? model.category}
        actions={
          <Link href="/repair-brain">
            <Button variant="secondary" size="sm">
              ← Repair Brain
            </Button>
          </Link>
        }
      />

      <ToggleGroup
        type="single"
        value={tab}
        onValueChange={(value) => value && setTab(value as Tab)}
        className="mb-4 flex flex-wrap gap-1 border-b border-border pb-2"
      >
        {tabs.map((t) => (
          <ToggleGroupItem
            key={t.key}
            value={t.key}
            className="rounded-md px-3 py-1.5 text-sm data-[state=on]:bg-green/10 data-[state=on]:text-green data-[state=on]:font-medium"
          >
            {t.label}
            {t.count !== undefined ? ` (${t.count})` : ""}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {tab === "overview" && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Model Identity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Manufacturer" value={model.manufacturer} />
              {model.brand && <Row label="Brand" value={model.brand} />}
              <Row label="Model Number" value={model.modelNumber} />
              {model.variant && <Row label="Variant" value={model.variant} />}
              <Row label="Category" value={model.category} />
              {model.subcategory && <Row label="Subcategory" value={model.subcategory} />}
              {model.productFamily && <Row label="Product Family" value={model.productFamily} />}
              <Row label="Instances in field" value={String(profile.instanceCount)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Repair Statistics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Total repairs" value={String(profile.repairStats.totalRepairs)} />
              <Row label="Successful" value={String(profile.repairStats.successfulRepairs)} />
              <Row label="Avg labor (min)" value={String(profile.repairStats.averageLaborMinutes)} />
              {profile.repairStats.totalRepairs > 0 && (
                <Row
                  label="Success rate"
                  value={`${Math.round((profile.repairStats.successfulRepairs / profile.repairStats.totalRepairs) * 100)}%`}
                />
              )}
              {coverage !== null && (
                <div className="pt-2 border-t border-border">
                  <div className="flex justify-between gap-4">
                    <span className="text-fg-muted">Knowledge coverage</span>
                    <span className={`font-medium ${coverage >= 80 ? "text-green" : coverage >= 50 ? "text-yellow" : "text-red"}`}>
                      {coverage}%
                    </span>
                  </div>
                  <p className="text-xs text-fg-dim mt-1">
                    {profile.faults.length} fault{profile.faults.length !== 1 ? "s" : ""} · {profile.repairProcedures.length} procedure{profile.repairProcedures.length !== 1 ? "s" : ""} · {profile.testPoints.length} test point{profile.testPoints.length !== 1 ? "s" : ""}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {Object.keys(model.specifications).length > 0 && (
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>Technical Specifications</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 text-sm">
                  {Object.entries(model.specifications).map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-fg-muted">{k}</dt>
                      <dd className="font-medium">{String(v)}</dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>
          )}

          {model.notes && (
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">{model.notes}</CardContent>
            </Card>
          )}

          {/* Intelligence */}
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Gauge className="size-4 text-chart-4" aria-hidden />
                Intelligence & insight
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ModelInsightsPanel modelId={id} />
            </CardContent>
          </Card>

          {/* Quick actions */}
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Maintain knowledge</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-sm text-fg-muted">
                Contribute to this model's profile. Entries save immediately and are attributed to you.
              </p>
              <div className="flex flex-wrap gap-2">
                <EditModelButton model={model} />
                <AddKnowledgeButton equipmentModelId={id} />
                <AddProcedureButton equipmentModelId={id} />
              </div>
            </CardContent>
          </Card>

          {/* Knowledge gaps */}
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <TriangleAlert className="size-4 text-yellow" aria-hidden />
                Knowledge gaps
              </CardTitle>
            </CardHeader>
            <CardContent>
              <KnowledgeGaps id={id} />
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "faults" && (
        <div className="space-y-3">
          {profile.faults.length === 0 && (
            <p className="text-fg-muted text-sm">No known faults recorded yet.</p>
          )}
          {profile.faults.map((f) => (
            <Card key={f.id}>
              <CardContent className="pt-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">{f.title}</div>
                    {f.faultCode && (
                      <div className="text-sm text-fg-muted">Code: {f.faultCode}</div>
                    )}
                    {f.description && (
                      <p className="mt-1 text-sm text-fg-muted">{f.description}</p>
                    )}
                    {f.probableCauses.length > 0 && (
                      <ul className="mt-2 text-sm list-disc pl-4">
                        {f.probableCauses.map((c) => (
                          <li key={c}>{c}</li>
                        ))}
                      </ul>
                    )}
                    {f.symptoms && f.symptoms.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {f.symptoms.map((s) => (
                          <Badge key={s.id} variant="secondary" className="text-[10px]">
                            {s.label}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className={`shrink-0 rounded px-2 py-0.5 text-xs ${confidenceBadge(f.confidenceStatus)}`}>
                      {f.confidenceStatus.replaceAll("_", " ")}
                    </span>
                    <RateButton kind="fault" id={f.id} count={f.usefulCount} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {tab === "diagnostics" && (
        <div className="space-y-3">
          {profile.diagnosticWorkflows.map((w) => (
            <Card key={w.id}>
              <CardContent className="pt-4 flex justify-between items-center">
                <span className="font-medium">{w.name}</span>
                <Link href={`/diagnostic-library`}>
                  <Button variant="secondary" size="sm">
                    Open workflow
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
          {profile.diagnosticWorkflows.length === 0 && (
            <p className="text-fg-muted text-sm">No linked diagnostic workflows.</p>
          )}
        </div>
      )}

      {tab === "repairs" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-fg-muted">
              {profile.repairProcedures.length} procedure{profile.repairProcedures.length !== 1 ? "s" : ""}
            </p>
            <AddProcedureButton equipmentModelId={id} />
          </div>
          {profile.repairProcedures.length === 0 && (
            <p className="text-fg-muted text-sm">No repair procedures yet.</p>
          )}
          {profile.repairProcedures.map((p) => (
            <Card key={p.id}>
              <CardContent className="pt-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium">{p.title}</div>
                    {p.description && <p className="text-sm text-fg-muted mt-1">{p.description}</p>}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {p.skillLevel && (
                        <Badge variant="secondary" className="text-[10px] capitalize">
                          {p.skillLevel.replaceAll("_", " ")}
                        </Badge>
                      )}
                      {p.expectedDurationMinutes != null && (
                        <span className="inline-flex items-center gap-1 text-xs text-fg-muted">
                          <Clock className="size-3.5" /> ~{p.expectedDurationMinutes} min
                        </span>
                      )}
                      {(p.requiredTools?.length ?? 0) > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs text-fg-muted">
                          <Wrench className="size-3.5" /> {p.requiredTools?.join(", ")}
                        </span>
                      )}
                    </div>
                    {p.steps && p.steps.length > 0 && (
                      <ol className="mt-3 space-y-1.5 text-sm">
                        {p.steps.map((s) => (
                          <li key={s.sequence} className="flex gap-2">
                            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                              {s.sequence}
                            </span>
                            <div className="min-w-0">
                              <span>{s.instruction}</span>
                              {s.tool && <span className="ml-1 text-fg-muted">[{s.tool}]</span>}
                              {s.warning && <span className="ml-1 text-yellow">⚠ {s.warning}</span>}
                            </div>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <EditProcedureButton procedure={p} />
                    <RateButton kind="procedure" id={p.id} count={p.usefulCount} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {tab === "parts" && (
        <div className="space-y-3">
          {profile.parts.map((p) => (
            <Card key={p.id}>
              <CardContent className="pt-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium">{p.partName}</div>
                    {p.oemPartNumber && (
                      <div className="text-sm text-fg-muted">OEM: {p.oemPartNumber}</div>
                    )}
                    {p.reliabilityNotes && <p className="mt-1 text-sm text-fg-muted">{p.reliabilityNotes}</p>}
                    {p.tags && p.tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {p.tags.map((t) => (
                          <Badge key={t} variant="outline" className="text-[10px]">
                            {t}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <RateButton kind="part" id={p.id} count={p.usefulCount} />
                </div>
              </CardContent>
            </Card>
          ))}
          {profile.parts.length === 0 && (
            <p className="text-fg-muted text-sm">No compatible parts catalogued.</p>
          )}
        </div>
      )}

      {tab === "documents" && (
        <div className="space-y-3">
          {profile.documents.map((d) => (
            <Card key={d.id}>
              <CardContent className="pt-4">
                <div className="font-medium">{d.title}</div>
                <div className="text-xs text-fg-muted">{d.documentType.replaceAll("_", " ")}</div>
              </CardContent>
            </Card>
          ))}
          {profile.documents.length === 0 && (
            <p className="text-fg-muted text-sm">No technical documents attached.</p>
          )}
        </div>
      )}

      {tab === "testPoints" && (
        <div className="space-y-3">
          {profile.testPoints.map((tp) => (
            <Card key={tp.id}>
              <CardContent className="pt-4 text-sm">
                {tp.component && <div className="font-medium">{tp.component}</div>}
                {tp.description && <p className="text-fg-muted">{tp.description}</p>}
              </CardContent>
            </Card>
          ))}
          {profile.testPoints.length === 0 && (
            <p className="text-fg-muted text-sm">No test points defined.</p>
          )}
        </div>
      )}

      {tab === "history" && (
        <Card>
          <CardHeader>
            <CardTitle>Anonymized Repair History</CardTitle>
          </CardHeader>
          <CardContent>
            {Object.entries(profile.repairStats.byFault).length === 0 ? (
              <p className="text-fg-muted text-sm">No repair history for this model yet.</p>
            ) : (
              <div className="space-y-4">
                {Object.entries(profile.repairStats.byFault).map(([faultId, stats]) => (
                  <div key={faultId} className="border-b border-border pb-3 last:border-0">
                    <div className="font-medium">{stats.count} cases</div>
                    {stats.topSolutions.length > 0 && (
                      <ul className="mt-1 text-sm text-fg-muted">
                        {stats.topSolutions.map((s) => (
                          <li key={s.action}>
                            {s.action} — {s.count}×
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-fg-muted">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}

function KnowledgeGaps({ id }: { id: string }) {
  const { data: gaps, isLoading } = useRepairBrainKnowledgeGapsQuery(id);

  if (isLoading) return <p className="text-sm text-fg-muted">Analyzing coverage…</p>;
  if (!gaps || gaps.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-chart-2/30 bg-chart-2/10 p-3 text-sm text-chart-2">
        All known faults have repair knowledge. No gaps detected.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-fg-muted">
        {gaps.length} fault{gaps.length !== 1 ? "s" : ""} lack{`${gaps.length === 1 ? "s" : ""}`} repair knowledge:
      </p>
      {gaps.map((g) => (
        <div key={g.faultId} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="truncate text-sm font-medium">{g.title}</span>
              {g.faultCode && <span className="rounded bg-surface-300 px-1.5 py-0.5 font-mono text-[11px]">{g.faultCode}</span>}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {g.missing.map((m) => (
                <Badge key={m} variant="outline" className="text-[10px] text-yellow">
                  Missing: {m}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
