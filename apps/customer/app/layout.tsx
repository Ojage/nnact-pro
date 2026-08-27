import type { ReactNode } from "react";
import "@fontsource-variable/source-sans-3";
import "./globals.css";
import { customerSiteMetadata } from "@/lib/site-metadata";

export const metadata = customerSiteMetadata;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-CM" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
