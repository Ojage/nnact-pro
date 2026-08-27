"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { WalkthroughStep, WalkthroughPlacement } from "@nnact/shared";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { SpotlightRect } from "./spotlight";
import { stepCountLabel } from "@/lib/walkthroughs/runtime";

/**
 * The tour bubble. Non-modal by design (the spotlight never blocks clicks, and
 * this panel only owns its own surface), it behaves like a dialog for screen
 * readers and ESC, and collapses into a bottom sheet on narrow viewports so a
 * coachmark never hides the very element it explains at 320–430px.
 */

type CoachmarkMode = "tooltip" | "sheet";

const PANEL_WIDTH = 376;
const GAP = 14;
const EDGE = 12;

export interface PanelPosition {
  mode: CoachmarkMode;
  top?: number;
  left?: number;
  /** CSS alignment hook for the arrow; unused for the sheet mode. */
  align?: "start" | "center" | "end";
}

export function computePanelPosition(
  rect: SpotlightRect,
  placement: WalkthroughPlacement | undefined,
  viewport: { width: number; height: number },
): PanelPosition {
  if (viewport.width < 480) {
    return { mode: "sheet" };
  }
  const sides: WalkthroughPlacement[] =
    placement && placement !== "auto" && placement !== "center"
      ? [placement]
      : ["bottom", "top", "right", "left"];

  for (const side of sides) {
    if (side === "bottom") {
      const top = rect.top + rect.height + GAP;
      if (top + 200 <= viewport.height - EDGE) {
        return { mode: "tooltip", top, left: clamp(rect.left - EDGE, EDGE, viewport.width - PANEL_WIDTH - EDGE), align: "start" };
      }
    }
    if (side === "top") {
      const top = rect.top - GAP - 200;
      if (top >= EDGE) {
        return { mode: "tooltip", top, left: clamp(rect.left - EDGE, EDGE, viewport.width - PANEL_WIDTH - EDGE), align: "start" };
      }
    }
    if (side === "right") {
      const left = rect.left + rect.width + GAP;
      if (left + PANEL_WIDTH <= viewport.width - EDGE) {
        return { mode: "tooltip", top: clamp(rect.top - EDGE, EDGE, viewport.height - 200 - EDGE), left, align: "start" };
      }
    }
    if (side === "left") {
      const left = rect.left - GAP - PANEL_WIDTH;
      if (left >= EDGE) {
        return { mode: "tooltip", top: clamp(rect.top - EDGE, EDGE, viewport.height - 200 - EDGE), left, align: "start" };
      }
    }
  }
  // Nothing fits near the target — center it so the text stays readable.
  return { mode: "sheet" };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

export function CoachmarkPanel({
  step,
  placement,
  rect,
  stepIndex,
  totalSteps,
  needsNavigation,
  blocked,
  fulfilled,
  routeLabel,
  onPrimary,
  onBack,
  onSkip,
  onClose,
  primaryLabel,
}: {
  step: WalkthroughStep | null;
  placement: WalkthroughPlacement | undefined;
  rect: SpotlightRect | null;
  stepIndex: number;
  totalSteps: number;
  needsNavigation: boolean;
  blocked: boolean;
  fulfilled: boolean;
  routeLabel: string | null;
  onPrimary: () => void;
  onBack: () => void;
  onSkip: () => void;
  onClose: () => void;
  primaryLabel?: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  if (typeof document === "undefined" || !step) return null;

  const position = rect ? computePanelPosition(rect, placement, { width: window.innerWidth, height: window.innerHeight }) : { mode: "sheet" as const };

  const label =
    primaryLabel ??
    (needsNavigation
      ? routeLabel ?? "Navigate"
      : step.kind === "tip"
        ? "Got it"
        : step.kind === "success"
          ? "Done"
          : blocked
            ? "Next"
            : "Next");

  const primaryDisabled = blocked && !fulfilled;

  const kindIcon =
    step.kind === "tip" ? "💡" : step.kind === "success" ? "✓" : null;

  const body = (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {kindIcon && (
            <span className="mb-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-green/15 text-xs text-green">
              {kindIcon}
            </span>
          )}
          <p
            id="coachmark-title"
            className="text-sm font-semibold text-fg"
          >
            {step.title}
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close walkthrough">
          ✕
        </Button>
      </div>

      <p className="text-[13px] leading-relaxed text-fg-muted">{step.body}</p>

      <div className="flex items-center gap-2 pt-1">
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-fg-dim">
          {stepCountLabel(stepIndex, totalSteps)}
        </span>
        <div className="flex-1">
          <Progress value={((stepIndex + 1) / totalSteps) * 100} className="h-1.5 bg-surface-300" />
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1">
        {stepIndex > 0 && (
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
          <Button size="sm" onClick={onPrimary} disabled={primaryDisabled}>
            {label}
          </Button>
        </div>
      </div>
    </div>
  );

  return createPortal(
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="coachmark-title"
      aria-live="polite"
      data-slot="coachmark"
      data-kind={step.kind}
      className={cn(
        "fixed z-[100] bg-popover text-popover-foreground shadow-xl ring-1 ring-border",
        position.mode === "sheet"
          ? "inset-x-3 bottom-3 rounded-xl p-4"
          : "rounded-lg p-4",
        mounted ? "opacity-100" : "opacity-0",
        "transition-opacity duration-150",
      )}
      style={
        position.mode === "tooltip"
          ? { top: position.top, left: position.left, width: PANEL_WIDTH }
          : undefined
      }
    >
      {body}
    </div>,
    document.body,
  );
}