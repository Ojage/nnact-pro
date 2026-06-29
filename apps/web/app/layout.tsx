import type { ReactNode } from "react";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Sidebar } from "@/components/sidebar";
import { MobileNav } from "@/components/mobile-nav";

export const metadata = {
  title: "OpenFieldPro",
  description: "Open-source field service management",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=localStorage.getItem("ofp_theme");if(t==="light")document.documentElement.setAttribute("data-theme","light")})()`,
          }}
        />
      </head>
      <body>
        <ThemeProvider>
          <Sidebar />
          <MobileNav />
          <main className="ml-0 md:ml-56 min-h-screen p-4 pt-16 md:p-8">{children}</main>
        </ThemeProvider>
      </body>
    </html>
  );
}
