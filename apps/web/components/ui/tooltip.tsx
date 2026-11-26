"use client";

import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

import { cn } from "./utils";

function TooltipProvider({
  delayDuration = 0,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  );
}

function Tooltip({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return (
    <TooltipProvider>
      <TooltipPrimitive.Root data-slot="tooltip" {...props} />
    </TooltipProvider>
  );
}

function TooltipTrigger({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

function TooltipContent({
  className,
  sideOffset = 0,
  children,
  variant = "default",
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content> & {
  variant?: "default" | "surface";
}) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          "animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 w-fit max-w-xs origin-(--radix-tooltip-content-transform-origin) rounded-lg px-2.5 py-1.5 text-left text-[12px] font-medium leading-snug",
          variant === "surface"
            ? "border border-border bg-card/95 text-fg shadow-[0_16px_40px_rgba(0,0,0,0.16)] backdrop-blur-xl"
            : "border border-white/10 bg-[#1d1d1f]/95 text-white shadow-[0_12px_30px_rgba(0,0,0,0.28)] backdrop-blur-xl dark:bg-[#2c2c2e]/95",
          className,
        )}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow
          className={cn(
            "z-50 size-2 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px]",
            variant === "surface"
              ? "border-border bg-card/95 fill-card"
              : "bg-[#1d1d1f]/95 fill-[#1d1d1f] dark:bg-[#2c2c2e]/95 dark:fill-[#2c2c2e]",
          )}
        />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
