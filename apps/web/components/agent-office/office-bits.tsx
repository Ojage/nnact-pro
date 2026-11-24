"use client";

import { memo } from "react";
import { Activity, Circle, Hourglass, Pause, TriangleAlert, Unplug } from "lucide-react";
import { AGENT_COST_WARN_RATIO, costRatio, type AgentOfficeStatus } from "@nnact/shared";
import { STATUS_LABEL, formatCents } from "@/lib/agent-office/format";
import styles from "./office.module.css";

const STATUS_ICON = {
  working: Activity,
  idle: Circle,
  waiting: Hourglass,
  paused: Pause,
  error: TriangleAlert,
  offline: Unplug,
} satisfies Record<AgentOfficeStatus, unknown>;

/** Status is always icon shape + words; the color only reinforces it. */
export function StatusLamp({ status }: { status: AgentOfficeStatus }) {
  const Icon = STATUS_ICON[status];
  return (
    <span className={styles.lamp} data-status={status}>
      <Icon className={styles.lampIcon} size={14} strokeWidth={2.5} aria-hidden="true" />
      {STATUS_LABEL[status]}
    </span>
  );
}

/**
 * Runs per hour across the last day: one series, so no legend. A 2px line in
 * the de-emphasis ink with the current hour marked in the accent.
 */
export const Sparkline = memo(function Sparkline({ values }: { values: readonly number[] }) {
  const total = values.reduce((sum, value) => sum + value, 0);
  const summary = `${total} run${total === 1 ? "" : "s"} in the last ${values.length || 24} hours`;
  if (values.length < 2) {
    return <span className="block text-xs text-fg-muted">{total > 0 ? summary : "No runs in the last day"}</span>;
  }
  const width = 100;
  const height = 24;
  const max = Math.max(1, ...values);
  const step = width / (values.length - 1);
  const points = values.map((value, index) => [index * step, height - (value / max) * height] as const);
  const [lastX, lastY] = points[points.length - 1];
  return (
    <span className="block">
      <svg className={styles.sparkline} viewBox={`0 -3 ${width} ${height + 6}`} preserveAspectRatio="none" aria-hidden="true">
        <polyline className={styles.sparkLine} points={points.map(([x, y]) => `${x},${y}`).join(" ")} />
        {/* A zero-length round-capped line stays circular under the stretched viewBox. */}
        <line className={styles.sparkNow} x1={lastX} y1={lastY} x2={lastX} y2={lastY} />
      </svg>
      <span className="sr-only">{summary}</span>
    </span>
  );
});

/** Spend against the daily cap. Severity is shown by fill, icon and words. */
export function CostMeter({ spentCents, capCents }: { spentCents: number; capCents: number | null }) {
  const ratio = costRatio(spentCents, capCents);
  const level = ratio == null ? "ok" : ratio >= 1 ? "over" : ratio >= AGENT_COST_WARN_RATIO ? "warn" : "ok";
  const label =
    capCents == null ? `${formatCents(spentCents)} today, no cap` : `${formatCents(spentCents)} of ${formatCents(capCents)} today`;
  return (
    <span className={styles.meter}>
      <span className={styles.meterLabel}>
        <span>{label}</span>
        {level !== "ok" ? (
          <span className="inline-flex items-center gap-1 font-semibold text-fg">
            <TriangleAlert size={12} aria-hidden="true" />
            {level === "over" ? "Cap reached" : `${Math.round((ratio ?? 0) * 100)}% of cap`}
          </span>
        ) : null}
      </span>
      {capCents != null ? (
        <span className={styles.meterTrack} data-level={level} aria-hidden="true">
          <span className={`${styles.meterFill} block`} style={{ inlineSize: `${Math.min(100, (ratio ?? 0) * 100)}%` }} />
        </span>
      ) : null}
    </span>
  );
}
