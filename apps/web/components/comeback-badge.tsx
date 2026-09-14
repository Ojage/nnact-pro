import { Badge } from "@/components/ui/badge";
import {
  COMEBACK_ACTION_STATUS_LABEL,
  COMEBACK_SEVERITY_LABEL,
  COMEBACK_STATUS_LABEL,
} from "@nnact/shared";
import type {
  ComebackActionStatus,
  ComebackSeverity,
  ComebackStatus,
} from "@nnact/shared";

type BadgeVariant = "default" | "secondary" | "destructive" | "outline" | "completed" | "canceled" | "draft" | "sent" | "lead" | "scheduled" | "in_progress" | "paid" | "void";

const statusMap: Record<ComebackStatus, BadgeVariant> = {
  REPORTED: "lead",
  TRIAGED: "scheduled",
  SCHEDULED: "scheduled",
  UNDER_INVESTIGATION: "in_progress",
  WAITING_FOR_PART: "secondary",
  AWAITING_VERIFICATION: "secondary",
  RESOLVED: "sent",
  MONITORING: "completed",
  CLOSED: "draft",
  DISPUTED: "canceled",
  NOT_A_COMEBACK: "outline",
};

const severityMap: Record<ComebackSeverity, BadgeVariant> = {
  LOW: "outline",
  MEDIUM: "secondary",
  HIGH: "default",
  CRITICAL: "destructive",
};

const actionStatusMap: Record<ComebackActionStatus, BadgeVariant> = {
  OPEN: "draft",
  IN_PROGRESS: "in_progress",
  DONE: "completed",
  CANCELLED: "canceled",
};

export function ComebackStatusBadge({ status }: { status: ComebackStatus }) {
  return <Badge variant={statusMap[status] ?? "outline"}>{COMEBACK_STATUS_LABEL[status]}</Badge>;
}

export function ComebackSeverityBadge({ severity }: { severity: ComebackSeverity }) {
  return <Badge variant={severityMap[severity] ?? "outline"}>{COMEBACK_SEVERITY_LABEL[severity]}</Badge>;
}

export function ComebackActionStatusBadge({ status }: { status: ComebackActionStatus }) {
  return <Badge variant={actionStatusMap[status] ?? "outline"}>{COMEBACK_ACTION_STATUS_LABEL[status]}</Badge>;
}