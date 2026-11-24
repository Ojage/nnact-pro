import * as React from "react";

import { cn } from "./utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        data-slot="textarea"
        className={cn(
          "flex field-sizing-content min-h-24 w-full resize-none rounded-[14px] border border-input bg-input-background px-4 py-3 text-base text-foreground shadow-none transition-[border-color,box-shadow,color,background-color] outline-none placeholder:text-muted-foreground/70 focus-visible:border-accent focus-visible:ring-4 focus-visible:ring-accent/15 aria-invalid:border-destructive aria-invalid:ring-destructive/20 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:aria-invalid:ring-destructive/40",
          className,
        )}
        {...props}
      />
    );
  }
);

Textarea.displayName = "Textarea";

export { Textarea };
