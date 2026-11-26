"use client";

import { useMemo } from "react";
import {
  BookOpenCheck,
  Brain,
  FileBarChart,
  Gauge,
  Library,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import { formatMoney } from "@nnact/shared";
import { PrefetchLink as Link } from "@/components/prefetch-link";
import { useComebackAnalyticsQuery, useComebacksQuery, useRepairBrainOrgHealthQuery } from "@/lib/redux/api";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusText, humanize } from "@/components/console/status-chip";
import { requestLearn } from "@/lib/walkthroughs/events";
import {
  ColumnChart,
  ConsolePage,
  MeterList,
  Panel,
  ProductTiles,
  ResourceList,
  ServiceOverviewHero,
  SummaryCards,
  illustrationSrc,
} from "@/components/console";

const viewAll = "text-sm font-medium text-[var(--shell-accent-text)] hover:underline";

/** Quality service overview: comeback rate, Repair Brain coverage and the quality tools. */
export default function QualityOverviewPage() {
  const analytics = useComebackAnalyticsQuery();
  const health = useRepairBrainOrgHealthQuery();
  const comebacks = useComebacksQuery({});
  const stats = analytics.data;
  const brain = health.data;

  const open = useMemo(() => (comebacks.data ?? []).filter((item) => !item.resolvedAt), [comebacks.data]);
  const trend = useMemo(
    () =>
      (stats?.trend ?? []).slice(-8).map((point) => ({
        label: new Date(point.week).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        value: point.created,
        detail: `${point.resolved} resolved`,
      })),
    [stats],
  );

  if (analytics.isLoading && health.isLoading) {
    return (
      <div className="grid gap-6" aria-busy="true" aria-label="Loading quality overview">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
          <Skeleton className="h-44 rounded-[8px]" />
          <Skeleton className="h-44 rounded-[8px]" />
        </div>
        <Skeleton className="h-24 rounded-[8px]" />
        <Skeleton className="h-64 rounded-[8px]" />
      </div>
    );
  }

  return (
    <ConsolePage className="gap-6">
      <ServiceOverviewHero
        title="Quality"
        icon={ShieldCheck}
        description="Fix it right the first time. Track comebacks, grow the Repair Brain from real repairs, and see which models and faults still lack a proven fix."
        quickActions={[
          { label: "Report a comeback", href: "/quality/comebacks/new", icon: RotateCcw },
          { label: "Search Repair Brain", href: "/repair-brain", icon: Brain },
          { label: "Open the diagnostic library", href: "/diagnostic-library", icon: Library },
          { label: "Check coverage", href: "/coverage", icon: Target },
          { label: "Read reviews", href: "/reviews", icon: Star },
        ]}
        illustration={{
          image: illustrationSrc("quality"),
          icon: Brain,
          title: "Every repair teaches the next one.",
          copy: "Diagnoses and outcomes from jobs feed the Repair Brain, so the next technician starts with a proven fix.",
          links: [
            { label: "Start a walkthrough", onClick: () => requestLearn() },
            { label: "Quality questions in the FAQ", href: "/help/faq" },
          ],
        }}
      />

      <SummaryCards
        label="Quality at a glance"
        items={[
          {
            label: "Comeback rate",
            icon: RotateCcw,
            value: stats ? `${stats.rate.ratePct.toFixed(1)}%` : "—",
            note: stats ? `${stats.rate.comebackCases} of ${stats.rate.completedJobs} completed jobs, last ${stats.periodDays} days` : "No data yet",
            attention: (stats?.rate.ratePct ?? 0) >= 5,
            href: "/quality/comebacks",
          },
          {
            label: "Open comebacks",
            icon: TriangleAlert,
            value: stats?.totalOpen ?? open.length,
            note: stats ? `${stats.repeatedCount} repeats · ${stats.escalatedCount} escalated` : undefined,
            attention: (stats?.escalatedCount ?? 0) > 0,
            href: "/quality/comebacks",
          },
          {
            label: "Repair Brain health",
            icon: Gauge,
            value: brain ? `${brain.healthScore} / 100` : "—",
            meter: brain ? brain.healthScore / 100 : undefined,
            note: brain ? `${brain.counts.totalKnowledge} knowledge items` : "No data yet",
            href: "/repair-brain",
          },
          {
            label: "First-time fix",
            icon: Wrench,
            value: brain && brain.counts.repairs ? `${brain.successRate}%` : "—",
            note: brain ? `${brain.counts.repairs} recorded repairs` : undefined,
            href: "/repair-brain",
          },
        ]}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Panel title="Comebacks reported per week" description="Hover or focus a column for the number resolved that week">
          {trend.length ? (
            <ColumnChart data={trend} format={(v) => `${v} reported`} formatTick={(v) => String(Math.round(v))} integer empty="No comebacks in this period." label="Comebacks reported per week" />
          ) : (
            <p className="py-6 text-center text-sm text-fg-muted">No comebacks in this period.</p>
          )}
        </Panel>
        <Panel title="Most common fault codes" description="From recorded repairs" actions={<Link href="/repair-brain" className={viewAll}>Repair Brain</Link>}>
          <MeterList
            empty="No fault codes recorded yet."
            rows={(brain?.topFaultCodes ?? []).slice(0, 6).map((fault) => ({
              id: fault.knownFaultId,
              label: fault.title,
              value: fault.count,
              valueText: `${fault.count} repair${fault.count === 1 ? "" : "s"}`,
            }))}
          />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <Panel title="Open comebacks" flush actions={<Link href="/quality/comebacks" className={viewAll}>View all</Link>}>
          <ResourceList
            empty="No open comebacks. Nice work."
            rows={open.slice(0, 6).map((item) => ({
              id: item.id,
              href: `/quality/comebacks/${item.id}`,
              primary: `${item.caseNumber} · ${item.complaintSummary}`,
              secondary: `${item.customerName ?? "Customer"} · ${humanize(item.severity)} severity`,
              status: <StatusText status={item.status} />,
            }))}
          />
        </Panel>
        <Panel title="Models that come back most" flush actions={<Link href="/repair-brain/models" className={viewAll}>Models</Link>}>
          <ResourceList
            empty="No model has a comeback yet."
            rows={(stats?.topModels ?? []).slice(0, 6).map((model, index) => ({
              id: model.equipmentModelId ?? `model-${index}`,
              href: model.equipmentModelId ? `/repair-brain/models/${model.equipmentModelId}` : "/repair-brain/models",
              primary: model.label,
              secondary: `${model.repeatRatePct}% repeat rate`,
              trailing: `${model.cases} case${model.cases === 1 ? "" : "s"}`,
            }))}
          />
        </Panel>
        <Panel title="Cost of comebacks" description={stats ? `Last ${stats.periodDays} days` : undefined} className="lg:col-span-2 xl:col-span-1">
          <MeterList
            empty="No comeback costs recorded."
            rows={
              stats
                ? [
                    { id: "internal", label: "Absorbed by the business", value: stats.totalInternalCostCents, valueText: formatMoney(stats.totalInternalCostCents) },
                    { id: "billable", label: "Billed to customers", value: stats.totalBillableCents, valueText: formatMoney(stats.totalBillableCents) },
                    { id: "supplier", label: "Recoverable from suppliers", value: stats.totalSupplierRecoverableCents, valueText: formatMoney(stats.totalSupplierRecoverableCents) },
                  ]
                : []
            }
          />
          {stats?.avgResolutionHours != null ? (
            <p className="mt-3 border-t border-[var(--shell-border)] pt-2 text-xs text-fg-muted">
              Average time to resolve: {Math.round(stats.avgResolutionHours)} hours
            </p>
          ) : null}
        </Panel>
      </div>

      <ProductTiles
        title="Quality products"
        tiles={[
          { href: "/repair-brain", icon: Brain, name: "Repair Brain", description: "Search proven fixes by model, symptom or fault code.", meta: brain ? `${brain.counts.models} models` : undefined },
          { href: "/repair-brain/workspace", icon: BookOpenCheck, name: "Model Workspace", description: "Build the knowledge taxonomy for each model." },
          { href: "/diagnostic-library", icon: Library, name: "Diagnostic Library", description: "Error codes, test sequences and service modes." },
          { href: "/coverage", icon: Target, name: "Coverage & Quality", description: "Which models and faults have a verified fix.", meta: brain ? `${brain.faultsWithCoverage} of ${brain.counts.faults} faults covered` : undefined },
          { href: "/quality/comebacks", icon: RotateCcw, name: "Comebacks", description: "Repeat visits, root causes and who pays.", meta: stats ? `${stats.totalOpen} open` : undefined },
          { href: "/reviews", icon: Star, name: "Reviews", description: "Customer reviews and replies." },
          { href: "/reports", icon: FileBarChart, name: "Reports", description: "Jobs, revenue and technician performance." },
          { href: "/diagnostics", icon: Sparkles, name: "Diagnostics", description: "Field diagnostic sessions from jobs." },
        ]}
      />
    </ConsolePage>
  );
}
