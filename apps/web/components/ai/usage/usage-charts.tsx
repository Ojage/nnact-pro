"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AiUsageBucket, AiUsageDailyPoint, AiUsageGroup } from "@/lib/redux/api";

const CHART_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

export function fmtCents(v: number): string {
  if (!Number.isFinite(v)) return "0c";
  return `${v.toLocaleString()}c`;
}

function shortDate(date: string): string {
  const [, m, d] = date.split("-");
  return `${Number(m)}/${Number(d)}`;
}

export function UsageTrendChart({ data }: { data: AiUsageDailyPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="costGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-300)" vertical={false} />
        <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 11, fill: "var(--fg-muted)" }} tickLine={false} axisLine={false} minTickGap={24} />
        <YAxis tick={{ fontSize: 11, fill: "var(--fg-muted)" }} tickLine={false} axisLine={false} tickFormatter={(v: number) => fmtCents(v)} width={64} />
        <Tooltip
          contentStyle={{ borderRadius: 10, border: "1px solid var(--surface-300)", fontSize: 12, boxShadow: "0 8px 24px rgba(0,0,0,.08)" }}
          labelStyle={{ fontWeight: 600, color: "var(--fg)" }}
          formatter={(value: unknown, name: unknown) => [fmtCents(typeof value === "number" ? value : Number(value) || 0), name === "costCents" ? "Cost" : String(name ?? "Value")]}
          labelFormatter={(label: unknown) => shortDate(String(label))}
        />
        <Area type="monotone" dataKey="costCents" stroke="var(--chart-1)" strokeWidth={2} fill="url(#costGrad)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function UsageCallsChart({ data }: { data: AiUsageDailyPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }} barGap={2}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-300)" vertical={false} />
        <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 11, fill: "var(--fg-muted)" }} tickLine={false} axisLine={false} minTickGap={24} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--fg-muted)" }} tickLine={false} axisLine={false} width={40} />
        <Tooltip
          cursor={{ fill: "var(--surface-200)", opacity: 0.6 }}
          contentStyle={{ borderRadius: 10, border: "1px solid var(--surface-300)", fontSize: 12, boxShadow: "0 8px 24px rgba(0,0,0,.08)" }}
          labelStyle={{ fontWeight: 600, color: "var(--fg)" }}
          formatter={(value: unknown, name: unknown) => [typeof value === "number" ? value : Number(value) || 0, name === "calls" ? "Calls" : "Images"]}
          labelFormatter={(label: unknown) => shortDate(String(label))}
        />
        <Bar dataKey="calls" fill="var(--chart-2)" radius={[3, 3, 0, 0]} maxBarSize={22} />
        <Bar dataKey="images" fill="var(--chart-4)" radius={[3, 3, 0, 0]} maxBarSize={22} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ProviderDonut({ byProvider, total }: { byProvider: Record<string, AiUsageBucket>; total: number }) {
  const rows = Object.entries(byProvider)
    .map(([key, bucket]) => ({ key, calls: bucket.calls, costCents: bucket.costCents }))
    .sort((a, b) => b.calls - a.calls);
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative h-44 w-44">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={rows} dataKey="calls" nameKey="key" innerRadius={52} outerRadius={78} paddingAngle={2} stroke="var(--surface-50)">
              {rows.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ borderRadius: 10, border: "1px solid var(--surface-300)", fontSize: 12, boxShadow: "0 8px 24px rgba(0,0,0,.08)" }}
              formatter={(value: unknown, _name: unknown, item: unknown) => {
                const entry = (item ?? {}) as { payload?: { key?: string; costCents?: number } | null };
                const v = typeof value === "number" ? value : Number(value) || 0;
                return [`${v.toLocaleString()} calls · ${fmtCents(entry.payload?.costCents ?? 0)}`, entry.payload?.key ?? ""];
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <p className="text-2xl font-bold text-fg">{total.toLocaleString()}</p>
          <p className="text-xs text-fg-muted">calls</p>
        </div>
      </div>
      <div className="flex w-full flex-wrap justify-center gap-x-4 gap-y-1">
        {rows.map((r, i) => (
          <span key={r.key} className="flex items-center gap-1.5 text-xs text-fg-muted">
            <span className="h-2 w-2 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
            {r.key} · {r.calls}
          </span>
        ))}
      </div>
    </div>
  );
}

export function GroupBars({ groups, valueKey }: { groups: AiUsageGroup[]; valueKey: "calls" | "costCents" }) {
  const max = Math.max(1, ...groups.map((g) => g[valueKey]));
  return (
    <div className="space-y-2">
      {groups.length === 0 ? <p className="text-sm text-fg-dim">No activity in this period.</p> : null}
      {groups.slice(0, 8).map((g) => {
        const pct = Math.round((g[valueKey] / max) * 100);
        return (
          <div key={g.key} className="space-y-1">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate text-fg" title={g.key}>{g.key}</span>
              <span className="shrink-0 font-mono text-fg-muted">{valueKey === "calls" ? `${g.calls} calls` : fmtCents(g.costCents)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-300/50">
              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: "var(--chart-1)" }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function BudgetMeter({ spent, budget, tone }: { spent: number; budget: number; tone: "green" | "amber" | "red" }) {
  const pct = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0;
  const color = tone === "red" ? "var(--chart-5)" : tone === "amber" ? "var(--chart-4)" : "var(--chart-2)";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-fg-muted">{fmtCents(spent)} spent</span>
        <span className="font-mono text-fg-muted">{pct}% of {fmtCents(budget)}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-surface-300/50">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}