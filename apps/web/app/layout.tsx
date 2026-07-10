import type { ReactNode } from "react";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { AppShell } from "@/components/app-shell";

export const metadata = {
  title: "OpenFieldPro — Field service operations and appliance diagnostics",
  description:
    "Open-source field service operations with CRM, dispatch, estimates, invoices, payments, mobile workflows, and validated appliance diagnostic execution.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <AppShell>{children}</AppShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
