"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_SECTIONS, decodeJwt } from "@/lib/nav";
import { useTheme } from "@/components/theme-provider";

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function MobileNav() {
  const pathname = usePathname();
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<{ name: string; role?: string } | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("ofp_token");
    if (token) {
      const payload = decodeJwt(token);
      if (payload?.name) setUser({ name: payload.name, role: payload.role });
    }
  }, []);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="md:hidden fixed top-0 left-0 z-30 h-12 w-12 flex items-center justify-center text-fg-muted hover:text-fg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 rounded-lg"
        aria-label="Open navigation menu"
      >
        <svg width="20" height="16" viewBox="0 0 20 16" fill="none">
          <rect y="0" width="20" height="2" rx="1" fill="currentColor" />
          <rect y="7" width="20" height="2" rx="1" fill="currentColor" />
          <rect y="14" width="20" height="2" rx="1" fill="currentColor" />
        </svg>
      </button>

      {open && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={cn(
          "md:hidden fixed left-0 top-0 bottom-0 w-72 z-50 flex flex-col bg-surface-50 border-r border-border shadow-2xl transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="h-14 flex items-center justify-between px-5 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent text-xs font-black text-white">OF</span>
            <div>
              <span className="block text-sm font-semibold text-fg">OpenFieldPro</span>
              <span className="block text-[10px] text-fg-dim">Operations + diagnostics</span>
            </div>
          </div>
          <button onClick={() => setOpen(false)} className="p-1 text-fg-muted hover:text-fg" aria-label="Close navigation menu">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 3L13 13M13 3L3 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-3">
          {NAV_SECTIONS.map((section) => (
            <div key={section.label} className="mb-5 last:mb-0">
              <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-fg-dim">{section.label}</p>
              <div className="flex flex-col gap-1">
                {section.links.map(({ href, label, icon }) => (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-3 text-sm no-underline transition-all duration-150",
                      isActive(pathname, href)
                        ? "bg-accent text-white font-medium"
                        : "text-fg-muted hover:text-fg hover:bg-surface-300",
                    )}
                  >
                    <span className="w-5 text-center text-base">{icon}</span>
                    {label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="p-3 border-t border-border shrink-0">
          <button
            onClick={() => {
              toggle();
              setOpen(false);
            }}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm text-fg-muted hover:text-fg hover:bg-surface-300 transition-all duration-150 cursor-pointer border-none bg-transparent"
          >
            <span className="text-base w-5 text-center">{theme === "dark" ? "☀" : "☾"}</span>
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </button>
        </div>

        <div className="p-3 border-t border-border shrink-0">
          {user ? (
            <div className="flex items-center gap-3 px-3 py-3">
              <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-xs font-medium text-white shrink-0">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <span className="block truncate text-sm text-fg-muted">{user.name}</span>
                <span className="block text-[10px] capitalize text-fg-dim">{user.role || "team member"}</span>
              </div>
            </div>
          ) : (
            <Link href="/login" onClick={() => setOpen(false)} className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm text-fg-muted hover:text-fg hover:bg-surface-300 no-underline">
              <span className="text-base w-5 text-center">↪</span>
              Sign in
            </Link>
          )}
        </div>
      </aside>
    </>
  );
}
