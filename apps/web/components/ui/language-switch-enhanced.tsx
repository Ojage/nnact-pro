"use client";

import * as React from "react";
import { cn } from "./utils";

interface LanguageSwitchEnhancedProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  leftLabel?: string;
  rightLabel?: string;
  className?: string;
}

export function LanguageSwitchEnhanced({
  checked,
  onCheckedChange,
  leftLabel = "EN",
  rightLabel = "FR",
  className,
}: LanguageSwitchEnhancedProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-xl border border-input bg-input-background p-1 transition-[border-color,box-shadow,background-color]",
        "focus-visible:outline-none focus-visible:border-accent focus-visible:ring-4 focus-visible:ring-accent/15",
        className
      )}
    >
      <span
        className={cn(
          "absolute inset-y-1 rounded-lg bg-accent shadow-[0_1px_2px_rgba(0,0,0,0.08)] transition-all duration-300 ease-out",
          !checked ? "left-1 w-[calc(50%-0.25rem)]" : "left-[calc(50%+0rem)] w-[calc(50%-0.25rem)]"
        )}
        aria-hidden="true"
      />
      <span
        className={cn(
          "relative z-10 min-w-12 px-3 py-1.5 text-center text-xs font-semibold tracking-[0.01em] transition-colors duration-200",
          !checked ? "text-accent-foreground" : "text-muted-foreground"
        )}
      >
        {leftLabel}
      </span>
      <span
        className={cn(
          "relative z-10 min-w-12 px-3 py-1.5 text-center text-xs font-semibold tracking-[0.01em] transition-colors duration-200",
          checked ? "text-accent-foreground" : "text-muted-foreground"
        )}
      >
        {rightLabel}
      </span>
    </button>
  );
}
