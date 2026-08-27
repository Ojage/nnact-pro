import { Badge } from "@/components/ui/badge";
import type { JobStatus, InvoiceStatus } from "@nnact/shared";

const jobStatusMap: Record<JobStatus, "lead" | "scheduled" | "in_progress" | "completed" | "canceled"> = {
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
  return <Badge variant={jobStatusMap[status]}>{status.replace("_", " ")}</Badge>;
}

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  return <Badge variant={invoiceStatusMap[status]}>{status}</Badge>;
}
