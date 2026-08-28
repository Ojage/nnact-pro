import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";

import { cn } from "./utils";

/**
 * GitHub-inspired Button Component with Centralized Theme Configuration
 * 
 * Variants:
 * - default (primary): Main call-to-action buttons
 * - secondary: Less prominent actions
 * - destructive (danger): Destructive actions like delete
 * - outline: Emphasized secondary actions with borders
 * - ghost: Minimal buttons with no background
 * - success: Positive or success actions
 * - link: Text links styled as buttons
 * 
 * Sizes: sm, default, lg, icon
 */

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-offset-2 cursor-pointer disabled:cursor-not-allowed",
  {
    variants: {
      variant: {
        // Primary - Main CTAs (GitHub's primary button style)
        default:
          "bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80 border border-primary shadow-sm " +
          "focus-visible:ring-ring",

        // Secondary - Less prominent actions
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 active:bg-secondary/70 border border-border " +
          "focus-visible:ring-ring",

        // Destructive - Dangerous actions
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/80 border border-destructive " +
          "focus-visible:ring-ring",

        // Alias used across staff pages
        danger:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/80 border border-destructive " +
          "focus-visible:ring-ring",

        // Outline - Emphasized secondary
        outline:
          "bg-background text-foreground hover:bg-accent hover:text-accent-foreground active:bg-accent/80 border border-input " +
          "focus-visible:ring-ring",

        // Ghost - Minimal visual weight
        ghost:
          "bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground active:bg-accent/80 border border-transparent " +
          "focus-visible:ring-ring",

        // Success - Positive actions
        success:
          "bg-chart-2 text-primary-foreground hover:bg-chart-2/90 active:bg-chart-2/80 border border-chart-2 " +
          "focus-visible:ring-ring",

        // Link - Text links
        link:
          "bg-transparent text-primary hover:underline hover:text-primary/90 active:text-primary/80 border-transparent " +
          "underline-offset-4",
      },
      size: {
        sm: "h-7 px-3 text-xs gap-1.5",
        default: "h-8 px-4 text-sm gap-2",
        lg: "h-10 px-6 text-base gap-2",
        icon: "size-8 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

const Button = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    /** Shows an inline spinner and disables the button while true. */
    loading?: boolean;
  }
>(({ className, variant, size, asChild = false, loading = false, disabled, children, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <Loader2 className="animate-spin" data-testid="button-spinner" aria-hidden="true" />
      ) : null}
      {children}
    </Comp>
  );
});

Button.displayName = "Button";

export { Button, buttonVariants };
