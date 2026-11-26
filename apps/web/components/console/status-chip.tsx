import type { LucideIcon } from "lucide-react";
import { Ban, CheckCircle2, CircleDashed, CircleDot, Clock, Info, Loader, Send, TriangleAlert, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type ChipTone = "success" | "info" | "warning" | "danger" | "neutral" | "progress";

const TONE_INK: Record<ChipTone, string> = {
  success: "text-[var(--console-success-fg)]",
  info: "text-[var(--console-info-fg)]",
  progress: "text-[var(--console-info-fg)]",
  warning: "text-[var(--console-warning-fg)]",
  danger: "text-[var(--console-danger-fg)]",
  neutral: "text-[var(--console-neutral-fg)]",
};

const TONE_ICON: Record<ChipTone, LucideIcon> = {
  success: CheckCircle2,
  info: Info,
  progress: Loader,
  warning: TriangleAlert,
  danger: XCircle,
  neutral: CircleDashed,
};

/**
 * Status in the console style: a coloured icon followed by plain words in the
 * body ink, so the state never depends on colour alone.
 */
export function StatusChip({
  tone,
  label,
  icon,
  className,
}: {
  tone: ChipTone;
  label: string;
  icon?: LucideIcon;
  className?: string;
}) {
  const Icon = icon ?? TONE_ICON[tone];
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-sm text-fg", className)}>
      <Icon className={cn("size-4 shrink-0", TONE_INK[tone])} strokeWidth={2.25} aria-hidden="true" />
      <span className="inline-block first-letter:uppercase">{label}</span>
    </span>
  );
}

/** A small grey label for secondary facts such as a source or a tier. */
export function Tag({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[4px] border border-[var(--shell-border)] px-1.5 py-px text-[11px] font-medium text-fg-muted",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Common status vocabularies mapped to tone + icon, shared by many pages. */
export const STATUS_PRESETS: Record<string, { tone: ChipTone; icon?: LucideIcon; label?: string }> = {
  draft: { tone: "neutral", icon: CircleDashed },
  lead: { tone: "neutral", icon: CircleDot },
  scheduled: { tone: "info", icon: Clock },
  in_progress: { tone: "progress", icon: Loader, label: "In progress" },
  completed: { tone: "success" },
  canceled: { tone: "neutral", icon: Ban },
  cancelled: { tone: "neutral", icon: Ban },
  sent: { tone: "info", icon: Send },
  paid: { tone: "success" },
  partially_paid: { tone: "warning", label: "Partially paid" },
  overdue: { tone: "danger", icon: TriangleAlert },
  void: { tone: "neutral", icon: Ban },
  approved: { tone: "success" },
  accepted: { tone: "success" },
  declined: { tone: "danger" },
  rejected: { tone: "danger" },
  expired: { tone: "warning", icon: Clock },
  active: { tone: "success" },
  paused: { tone: "warning" },
  pending: { tone: "warning", icon: Clock },
  open: { tone: "info", icon: CircleDot },
  closed: { tone: "neutral", icon: CheckCircle2 },
  failed: { tone: "danger" },
  error: { tone: "danger" },
  inactive: { tone: "neutral", icon: Ban },
  archived: { tone: "neutral", icon: Ban },
  published: { tone: "success" },
  publishing: { tone: "progress", icon: Loader },
  queued: { tone: "info", icon: Clock },
  ready: { tone: "info", icon: CircleDot },
  in_review: { tone: "warning", icon: Clock, label: "In review" },
  connected: { tone: "success" },
  disconnected: { tone: "neutral", icon: Ban },
  resolved: { tone: "success" },
};

export function humanize(status: string): string {
  const text = status.replaceAll("_", " ").replaceAll("-", " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** StatusChip from a raw status string, using the presets above. */
export function StatusText({ status, className }: { status: string; className?: string }) {
  const key = status.toLowerCase();
  const preset = STATUS_PRESETS[key] ?? { tone: "neutral" as const };
  return <StatusChip tone={preset.tone} icon={preset.icon} label={preset.label ?? humanize(key)} className={className} />;
}
