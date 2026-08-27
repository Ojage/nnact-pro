"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AuthGate } from "@/components/auth-gate";
import { Sidebar } from "@/components/sidebar";
import { MobileNav } from "@/components/mobile-nav";
import { CommandPalette } from "@/components/command-palette";
import { isPublicPath } from "@/lib/public-routes";
import { WalkthroughProvider } from "@/components/walkthroughs/walkthrough-provider";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  // Router context can be unavailable during the first SSR pass; avoid calling
  // string helpers on null and keep public routes (e.g. /login) free of the shell.
  if (pathname == null || isPublicPath(pathname)) return <>{children}</>;

  return (
    <AuthGate>
      <WalkthroughProvider>
        <Sidebar />
        <MobileNav />
        <main className="ml-0 min-h-screen p-4 pt-16 md:ml-64 md:p-8">
          <div className="mx-auto w-full max-w-[1600px]">{children}</div>
        </main>
        <CommandPalette />
      </WalkthroughProvider>
    </AuthGate>
  );
}
