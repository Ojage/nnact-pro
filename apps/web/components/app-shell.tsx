"use client";

import { useEffect, useRef, type ReactNode } from "react";
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
import { BranchSelectorDialog } from "@/components/shell/branch-selector-dialog";
import { ShellDrawer, ShellSidebar } from "@/components/shell/shell-nav";
import { ShellTopBar } from "@/components/shell/shell-top-bar";
import { useShellNav } from "@/components/shell/use-shell-nav";
import { useSessionUser } from "@/lib/use-session-user";
import { cn } from "@/lib/utils";

/** The console layout is the default; NEXT_PUBLIC_NEW_SHELL=false brings back the previous shell to compare. */
const NEW_SHELL = process.env.NEXT_PUBLIC_NEW_SHELL !== "false";

/**
 * Console layout: a grey canvas carries the top bar and the navigation, and
 * the page sits on a white panel. The sidebar is closed by default.
 */
function ConsoleFrame({ children }: { children: ReactNode }) {
  const { user } = useSessionUser();
  const nav = useShellNav(user?.id);
  const pathname = usePathname();
  const panel = useRef<HTMLElement>(null);

  // The panel, not the window, scrolls: start each page at its top, unless
  // the link points at an anchor on the page.
  useEffect(() => {
    if (!window.location.hash) panel.current?.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-[var(--shell-canvas)]">
      <ShellTopBar navOpen={nav.pinned || nav.drawerOpen} onMenu={nav.toggle} />
      <div className="flex min-h-0 flex-1">
        <ShellSidebar pinned={nav.pinned} />
        <ShellDrawer open={nav.drawerOpen} onClose={() => nav.setDrawerOpen(false)} />
        <main
          ref={panel}
          id="main-content"
          tabIndex={-1}
          className={cn(
            "shell-main min-w-0 flex-1 overflow-y-auto overscroll-contain border-[var(--shell-border)] bg-[var(--shell-panel)] p-4 pb-12 focus:outline-none",
            "md:mr-2 md:rounded-t-[12px] md:border md:border-b-0 md:p-8 lg:p-10",
            nav.pinned ? "md:ml-0" : "md:ml-2",
          )}
        >
          <div className="mx-auto w-full max-w-[1440px]">
            <RoleGate>{children}</RoleGate>
          </div>
        </main>
      </div>
    </div>
  );
}

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
          {NEW_SHELL ? (
            <ConsoleFrame>{children}</ConsoleFrame>
          ) : (
            <>
              <Sidebar />
              <MobileNav />
              <TopBar />
              <main className="apple-page ml-0 min-h-screen p-4 pb-12 pt-20 md:ml-[var(--sidebar-width)] md:p-8 md:pt-24 lg:p-10 lg:pt-24">
                <div className="mx-auto w-full max-w-[1440px]">
                  <RoleGate>{children}</RoleGate>
                </div>
              </main>
            </>
          )}
          <BranchSelectorDialog />
          <CommandPalette />
          <AiRunTray />
        </WalkthroughProvider>
      </AuthGate>
    </SessionProvider>
  );
}
