"use client";

import { Activity, AlertTriangle, Box, CheckCircle2, Gauge, Thermometer } from "lucide-react";
import { useRepairBrainModelInsightsQuery } from "@/lib/redux/api";
import type { ModelInsights } from "@/lib/repair-brain-api";

function healthLabel(score: number) {
  if (score >= 75) return { label: "Healthy", color: "text-chart-2", bar: "bg-chart-2" };
  if (score >= 45) return { label: "Moderate", color: "text-chart-3", bar: "bg-chart-3" };
  return { label: "Thin", color: "text-chart-6", bar: "bg-chart-6" };
}

export function ModelInsightsPanel({ modelId }: { modelId: string }) {
  const { data: insights, isLoading } = useRepairBrainModelInsightsQuery(modelId);

  if (isLoading || !insights) return null;
  return <ModelInsightsView insights={insights} />;
}

export function ModelInsightsView({ insights }: { insights: ModelInsights }) {
  const hl = healthLabel(insights.healthScore);
  const coverage =
    insights.coverage.faults === 0
      ? 0
      : Math.round((insights.coverage.faultsWithProcedure / insights.coverage.faults) * 100);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Repair brain health</p>
            <p className="mt-1 text-3xl font-bold tabular-nums">
              {insights.healthScore}
              <span className="text-base font-medium text-fg-muted">/100</span>
            </p>
          </div>
          <span className="rounded-full bg-surface-200 px-2 py-1 text-xs font-semibold">
            <span className={hl.color}>{hl.label}</span>
          </span>
        </div>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-surface-200">
          <div className={`h-full rounded-full ${hl.bar}`} style={{ width: `${insights.healthScore}%` }} />
        </div>

        <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4 text-chart-2" />
            <div>
              <p className="text-fg-muted">Success rate</p>
              <p className="font-semibold tabular-nums">{insights.successRate}%</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Activity className="size-4 text-chart-4" />
            <div>
              <p className="text-fg-muted">Total repairs</p>
              <p className="font-semibold tabular-nums">{insights.insightCounts.repairs}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Thermometer className="size-4 text-chart-6" />
            <div>
              <p className="text-fg-muted">Knowledge items</p>
              <p className="font-semibold tabular-nums">
                {insights.insightCounts.faults +
                  insights.insightCounts.procedures +
                  insights.insightCounts.parts +
                  insights.insightCounts.testPoints +
                  insights.insightCounts.documents}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Gauge className="size-4 text-chart-3" />
            <div>
              <p className="text-fg-muted">Fault coverage</p>
              <p className="font-semibold tabular-nums">{coverage}%</p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold uppercase tracking-wide text-fg-muted">Recurring faults</p>
          <AlertTriangle className="size-4 text-chart-6" />
        </div>
        {insights.recurringFaults.length === 0 ? (
          <p className="mt-3 text-sm text-fg-muted">No recurring faults detected.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {insights.recurringFaults.map((f) => (
              <li key={f.knownFaultId} className="flex items-center justify-between gap-3">
                <span className="truncate text-sm">{f.title}</span>
                <span className="shrink-0 rounded-full bg-surface-200 px-2 py-0.5 text-xs font-semibold tabular-nums">
                  {f.count}×
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-fg-muted">Repeated occurrences flag parts and fixes worth addressing.</p>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 lg:col-span-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold uppercase tracking-wide text-fg-muted">Part reliability</p>
          <Box className="size-4 text-fg-muted" />
        </div>
        {insights.partReliability.length === 0 ? (
          <p className="mt-3 text-sm text-fg-muted">No part reliability data yet.</p>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {insights.partReliability.map((p) => (
              <div key={p.name} className="rounded-lg border border-border bg-surface-100 p-3">
                <p className="truncate text-sm font-medium">{p.name}</p>
                {p.oem && <p className="truncate text-xs text-fg-muted">{p.oem}</p>}
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-200">
                    <div className="h-full rounded-full bg-chart-3" style={{ width: `${Math.min(100, p.timesProcured * 12)}%` }} />
                  </div>
                  <span className="text-xs font-semibold tabular-nums">{p.timesProcured}×</span>
                </div>
                {p.note && <p className="mt-2 text-xs text-fg-muted">{p.note}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
