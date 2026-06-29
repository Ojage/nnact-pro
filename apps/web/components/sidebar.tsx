"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { NAV_LINKS, decodeJwt } from "@/lib/nav";
import { useTheme } from "@/components/theme-provider";

export function Sidebar() {
  const pathname = usePathname();
  const { theme, toggle } = useTheme();
  const [user, setUser] = useState<{ name: string } | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("ofp_token");
    if (token) {
      const payload = decodeJwt(token);
      if (payload?.name) setUser({ name: payload.name });
    }
  }, []);

  return (
    <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-56 flex-col bg-surface-50 border-r border-border z-40">
      {/* Brand */}
      <div className="h-14 flex items-center gap-2.5 px-5 border-b border-border shrink-0">
        <span className="text-lg">⊹</span>
        <span className="font-semibold text-sm text-fg">OpenFieldPro</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 flex flex-col gap-1 p-3 overflow-y-auto">
        {NAV_LINKS.map(({ href, label, icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150 no-underline",
                active
                  ? "bg-accent text-white font-medium"
                  : "text-fg-muted hover:text-fg hover:bg-surface-300",
              )}
            >
              <span className="text-base w-5 text-center">{icon}</span>
              {label}
            </Link>
          );
        })}
      </nav>        {/* Theme toggle */}
      <div className="p-3 border-t border-border shrink-0">
        <button
          onClick={toggle}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-fg-muted hover:text-fg hover:bg-surface-300 transition-all duration-150 cursor-pointer border-none bg-transparent"
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
          <span className="text-base w-5 text-center">
            {theme === "dark" ? "☀" : "☾"}
          </span>
          {theme === "dark" ? "Light mode" : "Dark mode"}
        </button>
      </div>

        {/* Bottom section */}
      <div className="p-3 border-t border-border shrink-0">
        {user ? (
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-7 h-7 rounded-full bg-accent flex items-center justify-center text-xs font-medium text-white shrink-0">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <span className="text-sm text-fg-muted truncate">{user.name}</span>
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
