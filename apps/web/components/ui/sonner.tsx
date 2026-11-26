"use client";

import { useTheme } from "../ThemeProvider";
import { Toaster as Sonner, ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme } = useTheme();
  const sonnerTheme: ToasterProps["theme"] = theme;

  return (
    <Sonner
      theme={sonnerTheme}
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--card)",
          "--normal-text": "var(--fg)",
          "--normal-border": "var(--border)",
          "--success-bg": "var(--card)",
          "--success-text": "var(--color-success-fg)",
          "--success-border": "var(--border)",
          "--error-bg": "var(--card)",
          "--error-text": "var(--color-danger-fg)",
          "--error-border": "var(--border)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast:
            "rounded-[20px]! border-border! bg-card/95! shadow-[0_24px_70px_rgba(0,0,0,0.2)]! backdrop-blur-xl!",
          title: "text-sm! font-semibold!",
          description: "text-xs! text-fg-muted!",
          actionButton:
            "rounded-full! bg-accent! text-accent-foreground! text-xs! font-semibold!",
          cancelButton:
            "rounded-full! bg-surface-200! text-fg-muted! text-xs! font-semibold!",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
