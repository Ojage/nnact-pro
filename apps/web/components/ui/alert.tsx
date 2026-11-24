import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "./utils";

const alertVariants = cva(
  "relative grid w-full grid-cols-[0_1fr] items-start gap-y-1 rounded-2xl border px-4 py-3.5 text-sm has-[>svg]:grid-cols-[calc(var(--spacing)*5)_1fr] has-[>svg]:gap-x-3 [&>svg]:size-5 [&>svg]:translate-y-0.5 [&>svg]:text-current",
  {
    variants: {
      variant: {
        default: "border-border bg-card text-fg [&>svg]:text-fg-muted",
        info: "border-blue/20 bg-blue/10 text-blue [&>svg]:text-blue *:data-[slot=alert-description]:text-blue/90",
        success:
          "border-green/20 bg-green/10 text-green [&>svg]:text-green *:data-[slot=alert-description]:text-green/90",
        warning:
          "border-yellow/20 bg-yellow/10 text-yellow [&>svg]:text-yellow *:data-[slot=alert-description]:text-yellow/90",
        destructive:
          "border-red/20 bg-red/10 text-red [&>svg]:text-red *:data-[slot=alert-description]:text-red/90",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn(
        "col-start-2 line-clamp-1 min-h-4 font-semibold tracking-[-0.01em] text-fg",
        className,
      )}
      {...props}
    />
  );
}

function AlertDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "col-start-2 grid justify-items-start gap-1 text-sm text-fg-muted [&_p]:leading-relaxed",
        className,
      )}
      {...props}
    />
  );
}

export { Alert, AlertTitle, AlertDescription };
