"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";

import { cn } from "./utils";
import { Input } from "./input";
import { Button } from "./button";

const PasswordInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.ComponentProps<typeof Input>, "type">
>(({ className, ...props }, ref) => {
  const [visible, setVisible] = React.useState(false);

  return (
    <div className="relative">
      <Input
        ref={ref}
        type={visible ? "text" : "password"}
        className={cn("pr-12", className)}
        {...props}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute top-1/2 right-1.5 h-9 w-9 -translate-y-1/2 rounded-lg text-muted-foreground hover:bg-muted/70 hover:text-foreground"
        onClick={() => setVisible((value) => !value)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </Button>
    </div>
  );
});

PasswordInput.displayName = "PasswordInput";

export { PasswordInput };
