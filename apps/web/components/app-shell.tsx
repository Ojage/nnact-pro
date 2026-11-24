"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AuthGate } from "@/components/auth-gate";
import { RoleGate } from "@/components/role-gate";
import { CacheWarmer } from "@/components/cache-warmer";
import { NavigationPending } from "@/components/navigation-pending";
import { Sidebar } from "@/components/sidebar";
import { MobileNav } from "@/components/mobile-nav";
import { TopBar } from "@/components/top-bar";
import { CommandPalette } from "@/components/command-palette";
import { isPublicPath } from "@/lib/public-routes";
import { SessionProvider } from "@/lib/session-context";
import { WalkthroughProvider } from "@/components/walkthroughs/walkthrough-provider";
import { LiveNotificationsBridge } from "@/components/live-notifications-bridge";
import { AiRunTray } from "@/components/ai/ai-run-tray";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  // Router context can be unavailable during the first SSR pass; avoid calling
  // string helpers on null and keep public routes (e.g. /login) free of the shell.
  if (pathname == null || isPublicPath(pathname)) return <>{children}</>;

  return (
    <SessionProvider>
      <AuthGate>
        <WalkthroughProvider>
          <CacheWarmer />
          <NavigationPending />
          <LiveNotificationsBridge
            onFieldRefresh={(reason) => {
              window.dispatchEvent(new CustomEvent("nnact:field-refresh", { detail: { reason } }));
            }}
          />
          <Sidebar />
          <MobileNav />
          <TopBar />
          <main className="apple-page ml-0 min-h-screen p-4 pb-12 pt-20 md:ml-[var(--sidebar-width)] md:p-8 md:pt-24 lg:p-10 lg:pt-24">
            <div className="mx-auto w-full max-w-[1440px]">
              <RoleGate>{children}</RoleGate>
            </div>
          </main>
          <CommandPalette />
          <AiRunTray />
        </WalkthroughProvider>
      </AuthGate>
    </SessionProvider>
  );
}
