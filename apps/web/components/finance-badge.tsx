import { Ban, CheckCircle2, CircleDashed, Clock, Loader, Send, TriangleAlert, XCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { StatusChip, type ChipTone } from "@/components/console/status-chip";

const FINANCE_STATUS: Record<string, { tone: ChipTone; icon: LucideIcon }> = {
  DRAFT: { tone: "neutral", icon: CircleDashed },
  SUBMITTED: { tone: "info", icon: Send },
  UNDER_REVIEW: { tone: "info", icon: Clock },
  APPROVED: { tone: "success", icon: CheckCircle2 },
  REJECTED: { tone: "danger", icon: XCircle },
  PAID: { tone: "success", icon: CheckCircle2 },
  VOIDED: { tone: "neutral", icon: Ban },
  RECEIVED: { tone: "neutral", icon: CircleDashed },
  PARTIALLY_PAID: { tone: "warning", icon: Loader },
  OVERDUE: { tone: "danger", icon: TriangleAlert },
  DISPUTED: { tone: "warning", icon: TriangleAlert },
  REQUESTED: { tone: "neutral", icon: Clock },
  DISBURSED: { tone: "progress", icon: Loader },
  PARTIALLY_SETTLED: { tone: "progress", icon: Loader },
  SETTLED: { tone: "success", icon: CheckCircle2 },
  CANCELLED: { tone: "neutral", icon: Ban },
  active: { tone: "success", icon: CheckCircle2 },
  closed: { tone: "neutral", icon: Ban },
  // Lower-case invoice / estimate statuses shown on finance pages.
  draft: { tone: "neutral", icon: CircleDashed },
  sent: { tone: "info", icon: Send },
  paid: { tone: "success", icon: CheckCircle2 },
  void: { tone: "neutral", icon: Ban },
  approved: { tone: "success", icon: CheckCircle2 },
  declined: { tone: "danger", icon: XCircle },
  expired: { tone: "warning", icon: Clock },
};

/** Finance status as an icon plus words (the raw status, lower-cased). */
export function FinanceStatusBadge({ status }: { status: string }) {
  const preset = FINANCE_STATUS[status] ?? { tone: "neutral" as const, icon: CircleDashed };
  return <StatusChip tone={preset.tone} icon={preset.icon} label={status.replaceAll("_", " ").toLowerCase()} />;
}

export function BudgetLevelBadge({ level }: { level: "ok" | "warning" | "critical" }) {
  if (level === "critical") return <StatusChip tone="danger" label="Critical — over budget" />;
  if (level === "warning") return <StatusChip tone="warning" label="Warning — 80%+ used" />;
  return <StatusChip tone="success" label="On track" />;
}
