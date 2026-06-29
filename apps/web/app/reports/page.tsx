"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatMoney } from "@ofp/shared";
import type { ReportSummaryDTO } from "@ofp/shared";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";

const JOB_STATUS_LABELS: Record<string, string> = {
  lead: "Lead",
  scheduled: "Scheduled",
  in_progress: "In Progress",
  completed: "Completed",
  canceled: "Canceled",
};

const STATUS_COLORS: Record<string, string> = {
  lead: "bg-purple/15 text-purple",
  scheduled: "bg-blue/15 text-blue",
  in_progress: "bg-yellow/15 text-yellow",
  completed: "bg-green/15 text-green",
  canceled: "bg-red/15 text-red",
};

function StatCard({
  title,
  value,
  subtitle,
  accent,
}: {
  title: string;
  value: string;
  subtitle?: string;
  accent?: string;
}) {
  return (
    <Card className={accent}>
      <CardContent className="p-4">
        <p className="text-xs text-fg-muted mb-1">{title}</p>
        <p className="text-2xl font-bold text-fg tabular-nums">{value}</p>
        {subtitle && <p className="text-xs text-fg-dim mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}

function RatingStars({ rating }: { rating: number }) {
  const full = Math.round(rating);
  return (
    <span className="inline-flex gap-0.5" aria-label={`${rating.toFixed(1)} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={i <= full ? "text-yellow" : "text-surface-500"}
        >
          ★
        </span>
      ))}
    </span>
  );
}

export default function ReportsPage() {
  const [data, setData] = useState<ReportSummaryDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await api.reports();
        if (!cancelled) setData(r);
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div>
        <div className="flex items-end justify-between mb-8">
          <div>
            <Skeleton className="h-8 w-32 mb-2" />
            <Skeleton className="h-4 w-44" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Reports" description="Business performance at a glance." />

      {error && (
        <Card className="mb-6 border-red/30 bg-red/5">
          <p className="text-red text-sm">API unreachable ({error}).</p>
        </Card>
      )}

      {data && (
        <>
          {/* Top-level KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
            <StatCard
              title="Revenue Collected"
              value={formatMoney(data.revenueCollectedCents)}
              subtitle="Paid invoices"
            />
            <StatCard
              title="Accounts Receivable"
              value={formatMoney(data.accountsReceivableCents)}
              subtitle="Outstanding"
            />
            <StatCard
              title="Realized Margin"
              value={formatMoney(data.realizedMarginCents)}
              subtitle="Completed jobs"
              accent={data.realizedMarginCents >= 0 ? "border-l-4 border-l-green" : "border-l-4 border-l-red"}
            />
            <StatCard
              title="Pipeline Margin"
              value={formatMoney(data.pipelineMarginCents)}
              subtitle="All non-canceled"
              accent={data.pipelineMarginCents >= 0 ? "border-l-4 border-l-green" : "border-l-4 border-l-red"}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Pipeline by status */}
            <Card>
              <CardHeader>
                <CardTitle>Pipeline by Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {["lead", "scheduled", "in_progress", "completed", "canceled"].map((status) => {
                    const count = data.jobsByStatus[status as keyof typeof data.jobsByStatus] ?? 0;
                    const total = Object.values(data.jobsByStatus).reduce((a, b) => a + b, 0);
                    const pct = total > 0 ? ((count / total) * 100).toFixed(0) : "0";
                    return (
                      <div key={status} className="flex items-center gap-3">
                        <span className="w-24 text-xs text-fg-muted shrink-0">
                          {JOB_STATUS_LABELS[status] ?? status}
                        </span>
                        <div className="flex-1 h-4 rounded-full bg-surface-300 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${status === "completed" ? "bg-green" : status === "canceled" ? "bg-red" : status === "in_progress" ? "bg-yellow" : "bg-blue"}`}
                            style={{ width: `${pct}%`, minWidth: count > 0 ? "8px" : "0" }}
                          />
                        </div>
                        <span className="w-10 text-xs text-fg-muted text-right tabular-nums">
                          {count}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Margin by status */}
            <Card>
              <CardHeader>
                <CardTitle>Margin by Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {["lead", "scheduled", "in_progress", "completed", "canceled"].map((status) => {
                    const margin = (data.marginByStatus as Record<string, number>)[status] ?? 0;
                    return (
                      <div key={status} className="flex items-center justify-between">
                        <span className="text-xs text-fg-muted">
                          {JOB_STATUS_LABELS[status] ?? status}
                        </span>
                        <span
                          className={`text-sm font-mono tabular-nums font-semibold ${
                            margin >= 0 ? "text-green" : "text-red"
                          }`}
                        >
                          {margin >= 0 ? "+" : ""}{formatMoney(margin)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Ratings */}
            <Card>
              <CardHeader>
                <CardTitle>Customer Rating</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <div className="text-3xl font-bold text-fg tabular-nums">
                    {data.rating.average.toFixed(1)}
                  </div>
                  <div className="flex flex-col gap-1">
                    <RatingStars rating={data.rating.average} />
                    <p className="text-xs text-fg-muted">
                      Based on {data.rating.count} review{data.rating.count !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Quick summary */}
            <Card>
              <CardHeader>
                <CardTitle>Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[
                    { label: "Total jobs", value: Object.values(data.jobsByStatus).reduce((a, b) => a + b, 0) },
                    { label: "Completed", value: data.jobsByStatus.completed ?? 0 },
                    { label: "Canceled", value: data.jobsByStatus.canceled ?? 0 },
                    { label: "Avg rating", value: `${data.rating.average.toFixed(1)} ⭐` },
                  ].map((row) => (
                    <div key={row.label} className="flex justify-between items-center">
                      <span className="text-xs text-fg-muted">{row.label}</span>
                      <span className="text-sm text-fg font-semibold tabular-nums">{row.value}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
