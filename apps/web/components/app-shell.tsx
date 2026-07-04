"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { MobileNav } from "@/components/mobile-nav";
import { CommandPalette } from "@/components/command-palette";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isPublicLanding = pathname === "/welcome" || pathname.startsWith("/welcome/");

  if (isPublicLanding) {
    return <>{children}</>;
  }

  return (
    <>
      <Sidebar />
      <MobileNav />
      <main className="ml-0 md:ml-56 min-h-screen p-4 pt-16 md:p-8">{children}</main>
      <CommandPalette />
    </>
  );
}
