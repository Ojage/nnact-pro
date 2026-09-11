"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useAiHealthQuery, useAiUsageQuery, type AiUsageAnalyticsPayload } from "@/lib/redux/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  BudgetMeter,
  GroupBars,
  ProviderDonut,
  UsageCallsChart,
  UsageTrendChart,
  fmtCents,
} from "@/components/ai/usage/usage-charts";

function KpiCard({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: string; tone?: "green" | "amber" | "red" }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-fg-muted">{label}</p>
        <p className="mt-1.5 text-2xl font-bold text-fg">{value}</p>
        {sub ? <p className="mt-1 text-xs text-fg-muted">{sub}</p> : null}
        {tone ? (
          <span className={`mt-1 inline-block h-1.5 w-6 rounded-full ${tone === "green" ? "bg-green" : tone === "amber" ? "bg-amber" : "bg-red"}`} />
        ) : null}
      </CardContent>
    </Card>
  );
}

function StatTile({ label, value, unit }: { label: string; value: number; unit?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 rounded-lg bg-surface-300/40 px-3 py-2">
      <span className="text-xs text-fg-muted">{label}</span>
      <span className="font-mono text-sm font-semibold text-fg">
        {value.toLocaleString()}
        {unit ? <span className="text-xs text-fg-muted"> {unit}</span> : null}
      </span>
    </div>
  );
}

function SkeletonChart() {
  return <div className="h-56 w-full" ><Skeleton className="h-full w-full" /></div>;
}

export default function AiUsagePage() {
  const usageQ = useAiUsageQuery();
  const healthQ = useAiHealthQuery();
  const usage = usageQ.data as AiUsageAnalyticsPayload | undefined;
  const daily = usage?.analytics?.daily ?? [];
  const today = usage?.today;
  const month = usage?.month;
  const monthCost = usage?.monthSpend ?? 0;
  const monthBudget = usage?.monthlyBudgetCents ?? 0;
  const todayBudget = usage?.dailyBudgetCents ?? 0;
  const { reserveAvailable = 0, reserveTarget = 0 } = (healthQ.data ?? {}) as { reserveAvailable?: number; reserveTarget?: number };
  const reservePct = reserveTarget > 0 ? Math.round((reserveAvailable / reserveTarget) * 100) : 0;

  return (
    <div>
      <PageHeader
        title="AI usage · Analytics"
        description="Calls, cost, images and budgets across the AI automation. Data is tracked the moment each provider call completes."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => { usageQ.refetch(); healthQ.refetch(); }}>
              Refresh
            </Button>
            <Button asChild variant="ghost">
              <Link href="/ai">← Back to automation</Link>
            </Button>
          </div>
        }
      />

      {usageQ.isLoading || !usage ? (
        <div className="space-y-4">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-56 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (
        <div className="space-y-5">
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <KpiCard label="Calls today" value={today?.calls ?? 0} sub={`cost ${fmtCents(usage.todaySpend)}`} />
            <KpiCard label="Calls this month" value={month?.calls ?? 0} sub={`${fmtCents(usage.monthSpend)} of ${fmtCents(usage.monthlyBudgetCents)} budget`} />
            <KpiCard
              label="Images this month"
              value={month?.images ?? 0}
              sub={month && month.calls > 0 ? `${Math.round((month.images / month.calls) * 100)}% of calls produced images` : "no calls yet"}
            />
            <KpiCard
              label="Budget used"
              value={`${monthBudget > 0 ? Math.round((monthCost / monthBudget) * 100) : 0}%`}
              sub={`${fmtCents(monthCost)} / ${fmtCents(monthBudget)} this month`}
              tone={monthBudget > 0 && monthCost / monthBudget > 0.8 ? "red" : monthBudget > 0 && monthCost / monthBudget > 0.5 ? "amber" : "green"}
            />
          </div>

          {/* Budget meters */}
          <div className="grid gap-3 md:grid-cols-2">
            <Card>
              <CardContent className="space-y-2 p-5">
                <CardTitle className="text-sm">Today's budget</CardTitle>
                <CardDescription>Daily spend cap for autopilot runs.</CardDescription>
                <BudgetMeter spent={usage.todaySpend} budget={todayBudget} tone={todayBudget > 0 && usage.todaySpend / todayBudget > 0.8 ? "red" : "green"} />
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <StatTile label="Calls" value={today?.calls ?? 0} />
                  <StatTile label="Images" value={today?.images ?? 0} />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="space-y-2 p-5">
                <CardTitle className="text-sm">Month's budget</CardTitle>
                <CardDescription>Monthly spend cap across all providers.</CardDescription>
                <BudgetMeter
                  spent={monthCost}
                  budget={monthBudget}
                  tone={monthBudget > 0 && monthCost / monthBudget > 0.8 ? "red" : monthBudget > 0 && monthCost / monthBudget > 0.5 ? "amber" : "green"}
                />
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <StatTile label="Calls" value={month?.calls ?? 0} />
                  <StatTile label="Images" value={month?.images ?? 0} />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Trend charts */}
          <div className="grid gap-3 lg:grid-cols-2">
            <Card>
              <CardContent className="p-5">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm">Cost · last 30 days</CardTitle>
                    <CardDescription>Spend per day in cents.</CardDescription>
                  </div>
                  <Badge variant="secondary">{(usage.analytics.daily.reduce((a, d) => a + d.costCents, 0)).toLocaleString()}c total</Badge>
                </div>
                <div className="h-56">{daily.length ? <UsageTrendChart data={daily} /> : <SkeletonChart />}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm">Calls & images · last 30 days</CardTitle>
                    <CardDescription>Autopilot activity per day.</CardDescription>
                  </div>
                  <span className="flex items-center gap-3 text-xs text-fg-muted">
                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: "var(--chart-2)" }} /> Calls</span>
                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: "var(--chart-4)" }} /> Images</span>
                  </span>
                </div>
                <div className="h-56">{daily.length ? <UsageCallsChart data={daily} /> : <SkeletonChart />}</div>
              </CardContent>
            </Card>
          </div>

          {/* Provider + tasks + models */}
          <div className="grid gap-3 lg:grid-cols-3">
            <Card>
              <CardContent className="p-5">
                <CardTitle className="text-sm">Provider share</CardTitle>
                <CardDescription>Calls per provider this month.</CardDescription>
                <div className="pt-2"><ProviderDonut byProvider={usage.byProvider ?? {}} total={month?.calls ?? 0} /></div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <CardTitle className="text-sm">Calls by task</CardTitle>
                <CardDescription>What the autopilot spent calls on.</CardDescription>
                <div className="pt-2"><GroupBars groups={usage.analytics.byTask} valueKey="calls" /></div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <CardTitle className="text-sm">Cost by task</CardTitle>
                <CardDescription>Where the money goes.</CardDescription>
                <div className="pt-2"><GroupBars groups={usage.analytics.byTask} valueKey="costCents" /></div>
              </CardContent>
            </Card>
          </div>

          {/* Models table */}
          <Card>
            <CardContent className="p-5">
              <CardTitle className="text-sm">Model usage</CardTitle>
              <CardDescription>Provider & model breakdown for the last 30 days, ranked by cost.</CardDescription>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs uppercase tracking-wide text-fg-muted">
                      <th className="py-2 pr-3 font-medium">Provider / model</th>
                      <th className="py-2 pr-3 font-medium">Calls</th>
                      <th className="py-2 pr-3 font-medium">Images</th>
                      <th className="py-2 pr-3 font-medium">Input tokens</th>
                      <th className="py-2 pr-3 font-medium">Output tokens</th>
                      <th className="py-2 pr-3 text-right font-medium">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usage.analytics.byModel.length === 0 ? (
                      <tr><td colSpan={6} className="py-6 text-center text-fg-dim">No API calls recorded yet this month.</td></tr>
                    ) : (
                      usage.analytics.byModel.map((m) => (
                        <tr key={m.key} className="border-b border-border/60 last:border-0">
                          <td className="py-2 pr-3 font-medium text-fg">{m.key}</td>
                          <td className="py-2 pr-3 text-fg-muted">{m.calls.toLocaleString()}</td>
                          <td className="py-2 pr-3 text-fg-muted">{m.images.toLocaleString()}</td>
                          <td className="py-2 pr-3 font-mono text-xs text-fg-muted">{m.inputTokens.toLocaleString()}</td>
                          <td className="py-2 pr-3 font-mono text-xs text-fg-muted">{m.outputTokens.toLocaleString()}</td>
                          <td className="py-2 pr-3 text-right font-mono font-semibold text-fg">{fmtCents(m.costCents)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Reserve */}
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm">Reserve pool</CardTitle>
                  <CardDescription>Pre-approved evergreen pieces staged for scheduled publishing.</CardDescription>
                </div>
                <Badge variant={reservePct >= 100 ? "default" : reservePct >= 50 ? "secondary" : "outline"}>
                  {reserveAvailable} of {reserveTarget} ready
                </Badge>
              </div>
              <div className="mt-3">
                <BudgetMeter spent={reserveAvailable * 100} budget={Math.max(1, reserveTarget) * 100} tone="green" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}