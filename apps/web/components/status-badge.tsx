import type { JobStatus, InvoiceStatus } from "@nnact/shared";
import { STATUS_PRESETS, StatusChip } from "@/components/console/status-chip";

/**
 * Status chips for jobs, invoices and estimates. The visible words keep the
 * raw status text (shown with a capital first letter), and an icon in the
 * state's colour reinforces it.
 */
function Chip({ status }: { status: string }) {
  const preset = STATUS_PRESETS[status] ?? { tone: "neutral" as const };
  return <StatusChip tone={preset.tone} icon={preset.icon} label={status.replaceAll("_", " ")} />;
}

export function JobStatusBadge({ status }: { status: JobStatus }) {
  return <Chip status={status} />;
}

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  return <Chip status={status} />;
}

type EstimateStatus = "draft" | "sent" | "approved" | "declined" | "expired";

export function EstimateStatusBadge({ status }: { status: EstimateStatus }) {
  return <Chip status={status} />;
}
