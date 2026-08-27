import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "./utils";

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        destructive:
          "border-transparent bg-destructive text-white [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        completed:
          "border-transparent bg-chart-2/15 text-chart-2 [a&]:hover:bg-chart-2/25",
        canceled:
          "border-transparent bg-destructive/15 text-destructive [a&]:hover:bg-destructive/25",
        draft:
          "border-transparent bg-muted text-muted-foreground [a&]:hover:bg-muted/80",
        sent:
          "border-transparent bg-primary/15 text-primary [a&]:hover:bg-primary/25",
        lead:
          "border-transparent bg-muted text-muted-foreground [a&]:hover:bg-muted/80",
        scheduled:
          "border-transparent bg-primary/15 text-primary [a&]:hover:bg-primary/25",
        in_progress:
          "border-transparent bg-chart-4/15 text-chart-4 [a&]:hover:bg-chart-4/25",
        paid:
          "border-transparent bg-chart-2/15 text-chart-2 [a&]:hover:bg-chart-2/25",
        void:
          "border-transparent bg-destructive/15 text-destructive [a&]:hover:bg-destructive/25",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span";

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
