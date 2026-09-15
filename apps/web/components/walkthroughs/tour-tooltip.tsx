"use client";

import type { TooltipRenderProps } from "react-joyride";
import {
  CheckCircle2,
  Crosshair,
  Info,
  MapPin,
  MousePointerClick,
  Sparkles,
  X,
} from "lucide-react";
import type { WalkthroughStep } from "@nnact/shared";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { stepCountLabel } from "@/lib/walkthroughs/runtime";

/**
 * The tour bubble, rendered inside React Joyride's floater (Floating UI)
 * as a custom `tooltipComponent`. Decoration and layout come exclusively from
 * shadcn-style primitives + the app's design tokens; Joyride only positions,
 * re-flips, and scrolls the step into view.
 *
 * The engine drives navigation — the render props from Joyride's default
 * buttons (backProps/skipProps/primaryProps) are intentionally ignored and the
 * handlers below wire straight into the provider's step machine, so the
 * non-blocking and "no traps" invariants stay intact.
 */

/** Per-step extras the provider stashes on the Joyride step via `data`. */
export interface TourTooltipData {
  step: WalkthroughStep;
  handlers: {
    onPrimary: () => void;
    onBack: () => void;
    onSkip: () => void;
    onClose: () => void;
    blocked: boolean;
    fulfilled: boolean;
    primaryLabel?: string;
  };
}

const KIND_META: Record<
  WalkthroughStep["kind"],
  { icon: typeof Info; label: string; badge: string }
> = {
  info: { icon: Info, label: "Guide", badge: "bg-muted text-muted-foreground" },
  spotlight: { icon: Crosshair, label: "Explore", badge: "bg-accent text-accent-foreground" },
  action: { icon: MousePointerClick, label: "Your turn", badge: "bg-primary/15 text-primary" },
  navigation: { icon: MapPin, label: "Navigate", badge: "bg-chart-4/15 text-chart-4" },
  tip: { icon: Sparkles, label: "Reminder", badge: "bg-chart-2/15 text-chart-2" },
  success: { icon: CheckCircle2, label: "Done", badge: "bg-chart-2/15 text-chart-2" },
};

export function TourTooltip({ step, index, size, tooltipProps }: TooltipRenderProps) {
  const data = step.data as TourTooltipData | undefined;
  if (!data) return null;
  const { step: s, handlers } = data;
  const { onPrimary, onBack, onSkip, onClose, blocked, fulfilled, primaryLabel } = handlers;
  const meta = KIND_META[s.kind];
  const Icon = meta.icon;
  const primaryDisabled = blocked && !fulfilled;

  const label =
    primaryLabel ??
    (s.kind === "tip"
      ? "Got it"
      : s.kind === "success"
        ? "Done"
        : "Next");

  const handlePrimary = (): void => {
    if (primaryDisabled) return;
    if (s.kind === "success") {
      onClose();
      return;
    }
    onPrimary();
  };

  return (
    <div
      {...tooltipProps}
      role="dialog"
      aria-modal="false"
      aria-labelledby="tour-tooltip-title"
      aria-live="polite"
      data-slot="tour-tooltip"
      data-kind={s.kind}
      className="w-[min(92vw,380px)] rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-2xl"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-md border border-transparent px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
              meta.badge,
            )}
          >
            <Icon className="size-3" />
            {meta.label}
          </span>
          <p id="tour-tooltip-title" className="mt-1.5 text-sm font-semibold text-fg">
            {s.title}
          </p>
        </div>
        <Button variant="ghost" size="icon" className="-mr-1 -mt-1" onClick={onClose} aria-label="Close walkthrough">
          <X className="size-4" />
        </Button>
      </div>

      <p className="mt-2 text-[13px] leading-relaxed text-fg-muted">{s.body}</p>

      <div className="mt-3 flex items-center gap-2">
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.12em] text-fg-dim">
          {stepCountLabel(index, size)}
        </span>
        <div className="flex-1">
          <Progress value={((index + 1) / size) * 100} className="h-1.5 bg-surface-300" />
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        {index > 0 && (
          <Button variant="ghost" size="sm" onClick={onBack} aria-label="Previous step">
            Back
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onSkip} aria-label="Skip this walkthrough">
          Skip tour
        </Button>
        <div className="ml-auto flex items-center gap-2">
          {blocked && !fulfilled && (
            <span className="text-[11px] text-fg-dim italic">waiting for you…</span>
          )}
          <Button size="sm" onClick={handlePrimary} disabled={primaryDisabled}>
            {label}
          </Button>
        </div>
      </div>
    </div>
  );
}