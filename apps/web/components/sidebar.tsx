"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { NAV_SECTIONS, activeNavHref, decodeJwt } from "@/lib/nav";
import { useTheme } from "@/components/theme-provider";
import { NotificationsPopover } from "@/components/notifications-popover";

export function Sidebar() {
  const pathname = usePathname();
  const currentNavHref = activeNavHref(pathname);
  const { theme, toggle } = useTheme();
  const [user, setUser] = useState<{ name: string; role?: string } | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("ofp_token");
    if (token) {
      const payload = decodeJwt(token);
      if (payload?.name) setUser({ name: payload.name, role: payload.role });
    }
  }, []);

  return (
    <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-64 flex-col bg-surface-50 border-r border-border z-40">
      <div className="h-14 flex items-center justify-between px-5 border-b border-border shrink-0">
        <Link href="/" className="flex items-center gap-2.5 no-underline">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent text-xs font-black text-white">OF</span>
          <div>
            <span className="block text-sm font-semibold text-fg">OpenFieldPro</span>
            <span className="block text-[10px] text-fg-dim">Open field-service operations</span>
          </div>
        </Link>
        <NotificationsPopover />
      </div>

      <nav className="flex-1 overflow-y-auto p-3">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label} className="mb-5 last:mb-0">
            <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-fg-dim">
              {section.label}
            </p>
            <div className="flex flex-col gap-1">
              {section.links.map(({ href, label, icon }) => {
                const active = currentNavHref === href;
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm no-underline transition-all duration-150",
                      active
                        ? "bg-accent text-white font-medium"
                        : "text-fg-muted hover:text-fg hover:bg-surface-300",
                    )}
                  >
                    <span className="w-5 text-center text-base">{icon}</span>
                    <span>{label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-3 border-t border-border shrink-0">
        <button
          onClick={toggle}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-fg-muted hover:text-fg hover:bg-surface-300 transition-all duration-150 cursor-pointer border-none bg-transparent"
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
          <span className="text-base w-5 text-center">{theme === "dark" ? "☀" : "☾"}</span>
          {theme === "dark" ? "Light mode" : "Dark mode"}
        </button>
      </div>

      <div className="p-3 border-t border-border shrink-0">
        {user ? (
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-xs font-medium text-white shrink-0">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <span className="block truncate text-sm text-fg-muted">{user.name}</span>
              <span className="block text-[10px] capitalize text-fg-dim">{user.role || "team member"}</span>
            </div>
          </div>
        ) : (
          <Link
            href="/login"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-fg-muted hover:text-fg hover:bg-surface-300 transition-all duration-150 no-underline"
          >
            <span className="text-base w-5 text-center">↪</span>
            Sign in
          </Link>
        )}
      </div>
    </aside>
  );
}
