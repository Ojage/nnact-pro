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
      style={{cursor: 'pointer'}}
      className={cn(
        "group relative inline-flex items-center gap-2 rounded-full  transition-all duration-700 ease-out",
        "bg-gradient-to-r from-muted to-muted hover:from-muted/90 hover:to-muted/90",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className
      )}
    >
      {/* Animated Multi-Layer Border */}
      <span
        className={cn(
          "absolute inset-0 rounded-full transition-all duration-700 ease-out",
          "border-2",
          checked 
            ? "border-primary animate-[borderPulse_2s_ease-in-out_infinite]" 
            : "border-muted-foreground/30"
        )}
        style={{
          boxShadow: checked
            ? "0 0 25px rgba(59, 130, 246, 0.6), inset 0 0 15px rgba(59, 130, 246, 0.2)"
            : "0 0 10px rgba(0, 0, 0, 0.1)",
          filter: checked ? "brightness(1.2)" : "brightness(1)",
        }}
        aria-hidden="true"
      />

      {/* Rotating Border Gradient (only visible when active) */}
      <span
        className={cn(
          "absolute -inset-0.5 rounded-full overflow-hidden transition-opacity duration-700",
          checked ? "opacity-100" : "opacity-0"
        )}
        aria-hidden="true"
      >
        <span
          className="absolute inset-0 rounded-full"
          style={{
            background: `conic-gradient(
              from 0deg,
              transparent 0%,
              hsl(var(--primary)) 10%,
              transparent 20%,
              transparent 40%,
              hsl(var(--primary)) 50%,
              transparent 60%,
              transparent 80%,
              hsl(var(--primary)) 90%,
              transparent 100%
            )`,
            animation: "rotate 4s linear infinite",
            filter: "blur(4px)",
          }}
        />
      </span>

      {/* Secondary Rotating Border (faster, opposite direction) */}
      <span
        className={cn(
          "absolute -inset-1 rounded-full overflow-hidden transition-opacity duration-700",
          checked ? "opacity-60" : "opacity-0"
        )}
        aria-hidden="true"
      >
        <span
          className="absolute inset-0 rounded-full"
          style={{
            background: `conic-gradient(
              from 180deg,
              transparent 0%,
              hsl(var(--primary)) 25%,
              transparent 50%,
              hsl(var(--primary)) 75%,
              transparent 100%
            )`,
            animation: "rotate 3s linear infinite reverse",
            filter: "blur(8px)",
          }}
        />
      </span>

      {/* Pulsing Inner Glow */}
      <span
        className={cn(
          "absolute inset-1 rounded-full transition-all duration-700",
          "animate-[borderGlow_2s_ease-in-out_infinite]",
          checked 
            ? "shadow-[inset_0_0_20px_rgba(59,130,246,0.3)]" 
            : "shadow-[inset_0_0_8px_rgba(0,0,0,0.05)]"
        )}
        aria-hidden="true"
      />

      {/* Left Label */}
      <span
        className={cn(
          "relative z-10 px-4 py-1.5 text-sm font-medium transition-all duration-700 ease-out",
          "transform-gpu",
          !checked 
            ? "text-primary-foreground scale-110 brightness-125 drop-shadow-[0_0_8px_rgba(59,130,246,0.8)]" 
            : "text-muted-foreground scale-95 brightness-75 blur-[0.3px]"
        )}
      >
        {leftLabel}
      </span>

      {/* Right Label */}
      <span
        className={cn(
          "relative z-10 px-4 py-1 text-sm font-medium transition-all duration-700 ease-out",
          "transform-gpu",
          checked 
            ? "text-primary-foreground scale-110 brightness-125 drop-shadow-[0_0_8px_rgba(59,130,246,0.8)]" 
            : "text-muted-foreground scale-95 brightness-75 blur-[0.3px]"
        )}
      >
        {rightLabel}
      </span>

      {/* Sliding Background with Enhanced Glow */}
      <span
        className={cn(
          "absolute inset-y-1.5 h-[calc(100%-0.75rem)] rounded-full transition-all duration-700 ease-out",
          "bg-gradient-to-r from-primary via-primary to-primary",
          "shadow-2xl transform-gpu",
          !checked 
            ? "left-1.5 w-[calc(50%-0.375rem)]" 
            : "left-[calc(50%+0.125rem)] w-[calc(50%-0.5rem)]"
        )}
        style={{
          boxShadow: checked
            ? "0 0 30px rgba(59, 130, 246, 0.9), 0 0 60px rgba(59, 130, 246, 0.5), inset 0 0 15px rgba(255, 255, 255, 0.4)"
            : "0 0 30px rgba(59, 130, 246, 0.9), 0 0 60px rgba(59, 130, 246, 0.5), inset 0 0 15px rgba(255, 255, 255, 0.4)",
          animation: checked ? "borderGlow 2s ease-in-out infinite" : "borderGlow 2s ease-in-out infinite",
        }}
        aria-hidden="true"
      />

      {/* Moving Light Spot */}
      <span
        className={cn(
          "absolute inset-y-1.5 h-[calc(100%-0.75rem)] rounded-full transition-all duration-700 ease-out pointer-events-none",
          "bg-gradient-to-r from-transparent via-white/40 to-transparent",
          "blur-sm",
          !checked 
            ? "left-1.5 w-[calc(50%-0.375rem)]" 
            : "left-[calc(50%+0.125rem)] w-[calc(50%-0.5rem)]"
        )}
        aria-hidden="true"
      />
    </button>
  );
}
