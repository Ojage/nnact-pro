import { Badge } from "@/components/ui/badge";

type FinanceStatus =
  | "DRAFT" | "SUBMITTED" | "UNDER_REVIEW" | "APPROVED" | "REJECTED" | "PAID" | "VOIDED"
  | "RECEIVED" | "PARTIALLY_PAID" | "OVERDUE" | "DISPUTED"
  | "REQUESTED" | "DISBURSED" | "PARTIALLY_SETTLED" | "SETTLED" | "CANCELLED"
  | "active" | "closed";

const map: Record<FinanceStatus, "default" | "secondary" | "destructive" | "outline" | "completed" | "canceled" | "draft" | "sent" | "scheduled" | "in_progress" | "paid" | "void"> = {
  DRAFT: "draft",
  SUBMITTED: "sent",
  UNDER_REVIEW: "scheduled",
  APPROVED: "sent",
  REJECTED: "void",
  PAID: "paid",
  VOIDED: "void",
  RECEIVED: "draft",
  PARTIALLY_PAID: "in_progress",
  OVERDUE: "destructive",
  DISPUTED: "canceled",
  REQUESTED: "draft",
  DISBURSED: "in_progress",
  PARTIALLY_SETTLED: "in_progress",
  SETTLED: "paid",
  CANCELLED: "void",
  active: "completed",
  closed: "canceled",
};

export function FinanceStatusBadge({ status }: { status: string }) {
  const key = status as FinanceStatus;
  const variant = map[key] ?? "outline";
  return <Badge variant={variant}>{status.replaceAll("_", " ")}</Badge>;
}

export function BudgetLevelBadge({ level }: { level: "ok" | "warning" | "critical" }) {
  if (level === "critical") return <Badge variant="destructive">Critical — over budget</Badge>;
  if (level === "warning") return <Badge variant="outline">Warning — 80%+ used</Badge>;
  return <Badge variant="completed">On track</Badge>;
}