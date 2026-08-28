"use client";

import * as React from "react";
import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";
import { cn } from "./utils";

function InfoTip({
  children,
  label = "More information",
  side = "right",
  className,
}: {
  /** Explanation shown inside the tooltip. */
  children: React.ReactNode;
  /** Accessible name for the icon button. */
  label?: string;
  side?: "top" | "right" | "bottom" | "left";
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className={cn(
            "inline-flex size-4 shrink-0 cursor-help items-center justify-center rounded-full text-muted-foreground transition-colors align-middle hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 [&>svg]:size-3.5",
            className,
          )}
        >
          <Info aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent variant="surface" side={side} sideOffset={6} className="max-w-xs">
        {children}
      </TooltipContent>
    </Tooltip>
  );
}

export { InfoTip };