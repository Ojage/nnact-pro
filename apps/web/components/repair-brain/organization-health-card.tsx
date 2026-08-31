"use client";

import Link from "next/link";
import { BookOpen, CheckCircle2, Sparkles } from "lucide-react";
import { useRepairBrainOrgHealthQuery } from "@/lib/redux/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function OrganizationHealthCard() {
  const { data, isLoading } = useRepairBrainOrgHealthQuery();

  if (isLoading || !data) return null;

  const coverage =
    data.counts.faults === 0
      ? 0
      : Math.round((data.faultsWithCoverage / data.counts.faults) * 100);

  const gradient =
    data.healthScore >= 75 ? "from-chart-2 to-emerald-400" : data.healthScore >= 45 ? "from-chart-3 to-amber-400" : "from-chart-6 to-red-400";

  const stat = (label: string, value: string | number) => (
    <div className="rounded-lg border border-border bg-surface-100 p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-fg-muted">{label}</p>
      <p className="mt-0.5 text-lg font-bold tabular-nums">{value}</p>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4 text-chart-4" aria-hidden />
          Knowledge base health
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4">
          <Link href="/repair-brain">
            <span
              className={`flex size-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${gradient} text-lg font-bold text-white shadow-sm`}
            >
              {data.healthScore}
            </span>
          </Link>
          <div className="flex-1">
            <p className="text-sm font-medium">
              {data.healthScore >= 75
                ? "Well documented"
                : data.healthScore >= 45
                  ? "Growing — add procedures"
                  : "Needs knowledge"}
            </p>
            <p className="text-sm text-fg-muted">
              {data.counts.models} models · {data.counts.totalKnowledge} knowledge items · {coverage}% fault coverage
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {stat("Models", data.counts.models)}
          {stat("Procedures", data.counts.procedures)}
          {stat("Verified faults", data.verifiedFaults)}
          {stat(
            "Success rate",
            data.counts.repairs ? `${data.successRate}%` : "—",
          )}
        </div>

        {data.topFaultCodes.length > 0 && (
          <div className="mt-4 border-t border-border pt-3">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-fg-muted">
              <CheckCircle2 className="size-3.5 text-chart-2" aria-hidden />
              Most recurring faults
            </p>
            <div className="flex flex-wrap gap-1.5">
              {data.topFaultCodes.slice(0, 6).map((f) => (
                <span key={f.knownFaultId} className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-200 px-2 py-0.5 text-xs">
                  {f.title}
                  <span className="font-semibold tabular-nums text-fg-muted">{f.count}×</span>
                </span>
              ))}
            </div>
            <p className="mt-2 flex items-center gap-1 text-xs text-fg-muted">
              <BookOpen className="size-3" aria-hidden />
              Recurring faults signal parts and fixes worth documenting.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
