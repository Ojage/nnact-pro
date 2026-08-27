"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { repairBrainApi, type EquipmentTimeline } from "@/lib/repair-brain-api";

export default function EquipmentInstancePage() {
  const params = useParams();
  const id = params.id as string;
  const [timeline, setTimeline] = useState<EquipmentTimeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    repairBrainApi
      .getEquipmentTimeline(id)
      .then(setTimeline)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="p-8 text-fg-muted">Loading equipment…</div>;
  if (error || !timeline) {
    return <div className="p-8 text-red">Failed to load equipment: {error ?? "not found"}</div>;
  }

  const inst = timeline.instance as Record<string, string | null>;
  const modelId = inst.equipmentModelId;

  return (
    <div>
      <PageHeader
        title={`${inst.make ?? ""} ${inst.model ?? inst.type}`.trim()}
        description={inst.serialNumber ? `S/N ${inst.serialNumber}` : "Customer equipment"}
        actions={
          modelId ? (
            <Link href={`/repair-brain/models/${modelId}`}>
              <Button size="sm">View Model Knowledge</Button>
            </Link>
          ) : undefined
        }
      />

      <div className="grid gap-4 md:grid-cols-2 mb-6">
        <Card>
          <CardHeader>
            <CardTitle>Instance Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <InfoRow label="Type" value={inst.type} />
            <InfoRow label="Make" value={inst.make} />
            <InfoRow label="Model" value={inst.model} />
            <InfoRow label="Serial" value={inst.serialNumber} />
            <InfoRow label="Asset Tag" value={inst.assetTag} />
            <InfoRow label="Condition" value={inst.condition} />
            {inst.notes && <p className="text-fg-muted pt-2">{inst.notes}</p>}
          </CardContent>
        </Card>

        {timeline.model && (
          <Card>
            <CardHeader>
              <CardTitle>Linked Model</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              <p className="font-medium">
                {timeline.model.manufacturer} {timeline.model.modelNumber}
              </p>
              {timeline.model.modelName && (
                <p className="text-fg-muted">{timeline.model.modelName}</p>
              )}
              <Link href={`/repair-brain/models/${timeline.model.id}`}>
                <Button variant="secondary" size="sm" className="mt-3">
                  Open model knowledge →
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Diagnostic Sessions ({timeline.diagnosticSessions.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {timeline.diagnosticSessions.length === 0 && (
            <p className="text-sm text-fg-muted">No diagnostic sessions recorded.</p>
          )}
          {timeline.diagnosticSessions.map((s) => {
            const session = s as Record<string, string>;
            return (
              <div key={session.id} className="rounded border border-border p-3 text-sm">
                <div className="font-medium capitalize">{session.status?.replaceAll("_", " ")}</div>
                {session.customerComplaint && (
                  <p className="text-fg-muted">{session.customerComplaint}</p>
                )}
                {session.summary && <p className="mt-1">{session.summary}</p>}
                <Link href={`/diagnostics/${session.id}`} className="text-green text-xs mt-1 inline-block">
                  View session →
                </Link>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Repair Outcomes ({timeline.repairOutcomes.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {timeline.repairOutcomes.length === 0 && (
            <p className="text-sm text-fg-muted">No repair outcomes recorded.</p>
          )}
          {timeline.repairOutcomes.map((o) => {
            const outcome = o as Record<string, string | boolean>;
            return (
              <div key={outcome.id as string} className="rounded border border-border p-3 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium capitalize">
                    {String(outcome.outcome).replaceAll("_", " ")}
                  </span>
                  {outcome.isFailedAttempt && (
                    <span className="text-xs bg-yellow/10 text-yellow px-1.5 py-0.5 rounded">
                      Failed attempt
                    </span>
                  )}
                </div>
                {outcome.whatWasDone && <p className="text-fg-muted">{String(outcome.whatWasDone)}</p>}
                {outcome.conclusion && <p className="mt-1">{String(outcome.conclusion)}</p>}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-4">
      <span className="text-fg-muted">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
