import * as React from "react";
import { cn } from "@/lib/utils";

const variants = {
  default: "bg-accent text-white hover:bg-accent-hover shadow-xs",
  secondary: "bg-surface-300 text-fg hover:bg-surface-400 border border-border",
  ghost: "text-fg-muted hover:text-fg hover:bg-surface-300",
  outline: "border border-border bg-transparent hover:bg-surface-300 text-fg",
  danger: "bg-red/10 text-red hover:bg-red/20 border border-red/20",
} as const;

const sizes = {
  sm: "h-8 px-3 text-xs rounded-md",
  default: "h-10 px-4 text-sm rounded-lg",
  lg: "h-12 px-6 text-base rounded-lg",
  icon: "h-10 w-10 rounded-lg",
} as const;

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = "Button";

export { Button };
