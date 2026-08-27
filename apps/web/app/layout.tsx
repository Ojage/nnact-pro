import type { ReactNode } from "react";
import "@fontsource-variable/source-sans-3";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { AppShell } from "@/components/app-shell";
import { SiteJsonLd } from "@/components/json-ld";
import { buildRootMetadata } from "@/lib/site-metadata";

export const metadata = buildRootMetadata();

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-CM" data-theme="light" suppressHydrationWarning>
      <body>
        <SiteJsonLd />
        <ThemeProvider>
          <AppShell>{children}</AppShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
