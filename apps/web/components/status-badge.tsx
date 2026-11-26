import { Badge } from "@/components/ui/badge";
import type { JobStatus, InvoiceStatus } from "@nnact/shared";

const statusDot = "before:mr-0.5 before:inline-block before:size-1.5 before:rounded-full before:bg-current before:opacity-70";

const jobStatusMap: Record<JobStatus, "draft" | "lead" | "scheduled" | "in_progress" | "completed" | "canceled"> = {
  draft: "draft",
  lead: "lead",
  scheduled: "scheduled",
  in_progress: "in_progress",
  completed: "completed",
  canceled: "canceled",
};

const invoiceStatusMap: Record<InvoiceStatus, "draft" | "sent" | "paid" | "void"> = {
  draft: "draft",
  sent: "sent",
  paid: "paid",
  void: "void",
};

export function JobStatusBadge({ status }: { status: JobStatus }) {
  return <Badge variant={jobStatusMap[status]} className={statusDot}>{status.replace("_", " ")}</Badge>;
}

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  return <Badge variant={invoiceStatusMap[status]} className={statusDot}>{status}</Badge>;
}

type EstimateStatus = "draft" | "sent" | "approved" | "declined" | "expired";

const estimateStatusMap: Record<EstimateStatus, "draft" | "sent" | "paid" | "void" | "canceled"> = {
  draft: "draft",
  sent: "sent",
  approved: "paid",
  declined: "void",
  expired: "canceled",
};

export function EstimateStatusBadge({ status }: { status: EstimateStatus }) {
  return <Badge variant={estimateStatusMap[status]} className={statusDot}>{status.replaceAll("_", " ")}</Badge>;
}
