"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { repairBrainApi, type ModelProfile } from "@/lib/repair-brain-api";

type Tab =
  | "overview"
  | "faults"
  | "diagnostics"
  | "repairs"
  | "parts"
  | "documents"
  | "measurements"
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

export default function EquipmentModelProfilePage() {
  const params = useParams();
  const id = params.id as string;
  const [profile, setProfile] = useState<ModelProfile | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    repairBrainApi
      .getModelProfile(id)
      .then(setProfile)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="p-8 text-fg-muted">Loading model knowledge…</div>;
  if (error || !profile) {
    return (
      <div className="p-8">
        <p className="text-red">Failed to load model: {error ?? "not found"}</p>
        <Link href="/repair-brain">
          <Button variant="secondary" size="sm" className="mt-4">
            Back to Repair Brain
          </Button>
        </Link>
      </div>
    );
  }

  const { model } = profile;
  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "overview", label: "Overview" },
    { key: "faults", label: "Known Faults", count: profile.faults.length },
    { key: "diagnostics", label: "Diagnostics", count: profile.diagnosticWorkflows.length },
    { key: "repairs", label: "Repair Procedures", count: profile.repairProcedures.length },
    { key: "parts", label: "Parts", count: profile.parts.length },
    { key: "documents", label: "Documents", count: profile.documents.length },
    { key: "measurements", label: "Test Points", count: profile.testPoints.length },
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
                  </div>
                  <span className={`rounded px-2 py-0.5 text-xs ${confidenceBadge(f.confidenceStatus)}`}>
                    {f.confidenceStatus.replaceAll("_", " ")}
                  </span>
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
          {profile.repairProcedures.map((p) => (
            <Card key={p.id}>
              <CardContent className="pt-4">
                <div className="font-medium">{p.title}</div>
                {p.description && <p className="text-sm text-fg-muted mt-1">{p.description}</p>}
              </CardContent>
            </Card>
          ))}
          {profile.repairProcedures.length === 0 && (
            <p className="text-fg-muted text-sm">No repair procedures yet.</p>
          )}
        </div>
      )}

      {tab === "parts" && (
        <div className="space-y-3">
          {profile.parts.map((p) => (
            <Card key={p.id}>
              <CardContent className="pt-4">
                <div className="font-medium">{p.partName}</div>
                {p.oemPartNumber && (
                  <div className="text-sm text-fg-muted">OEM: {p.oemPartNumber}</div>
                )}
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

      {tab === "measurements" && (
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
