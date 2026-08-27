"use client";

import * as React from "react";
import { cn } from "./utils";

interface LoadRippleProps {
  message?: string;
  className?: string;
}

export const LoadRipple: React.FC<LoadRippleProps> = ({ message, className }) => {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-4", className)}>
      <div className="relative h-[250px] aspect-square">
        {/* Ripple circles - optimized for light and dark mode */}
        <span className="absolute inset-[40%] rounded-full border-2 border-blue-500/80 dark:border-cyan-400/80 animate-[ripple_2s_infinite_ease-in-out] bg-gradient-to-tr from-blue-500/20 to-cyan-400/20 dark:from-cyan-400/20 dark:to-blue-400/20 backdrop-blur-sm z-[98] shadow-lg shadow-blue-500/20 dark:shadow-cyan-400/20" />
        <span className="absolute inset-[30%] rounded-full border-2 border-blue-500/60 dark:border-cyan-400/60 animate-[ripple_2s_infinite_ease-in-out_0.2s] bg-gradient-to-tr from-blue-500/15 to-cyan-400/15 dark:from-cyan-400/15 dark:to-blue-400/15 backdrop-blur-sm z-[97] shadow-lg shadow-blue-500/15 dark:shadow-cyan-400/15" />
        <span className="absolute inset-[20%] rounded-full border-2 border-blue-500/40 dark:border-cyan-400/40 animate-[ripple_2s_infinite_ease-in-out_0.4s] bg-gradient-to-tr from-blue-500/10 to-cyan-400/10 dark:from-cyan-400/10 dark:to-blue-400/10 backdrop-blur-sm z-[96] shadow-md shadow-blue-500/10 dark:shadow-cyan-400/10" />
        <span className="absolute inset-[10%] rounded-full border border-blue-500/30 dark:border-cyan-400/30 animate-[ripple_2s_infinite_ease-in-out_0.6s] bg-gradient-to-tr from-blue-500/8 to-cyan-400/8 dark:from-cyan-400/8 dark:to-blue-400/8 backdrop-blur-sm z-[95]" />
        <span className="absolute inset-0 rounded-full border border-blue-500/20 dark:border-cyan-400/20 animate-[ripple_2s_infinite_ease-in-out_0.8s] bg-gradient-to-tr from-blue-500/5 to-cyan-400/5 dark:from-cyan-400/5 dark:to-blue-400/5 backdrop-blur-sm z-[94]" />
      </div>
      {message && (
        <p className="text-sm font-medium text-[--color-fg-muted] animate-pulse">
          {message}
        </p>
      )}
    </div>
  );
};

export default LoadRipple;