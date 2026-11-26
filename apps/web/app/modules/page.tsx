"use client";

import { PrefetchLink as Link } from "@/components/prefetch-link";
import { navSectionsForRole, type NavRole } from "@/lib/nav";
import { useSessionUser } from "@/lib/use-session-user";

/** Every module this role may open, grouped as in the navigation. */
export default function ModulesPage() {
  const { user } = useSessionUser();
  const sections = user?.role ? navSectionsForRole(user.role as NavRole) : [];
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-[28px] font-normal text-fg">All modules</h1>
        <p className="mt-1 text-sm text-fg-muted">Everything your role can open, grouped as in the navigation.</p>
      </div>
      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((section) => (
          <section key={section.label} aria-labelledby={`modules-${section.label}`}>
            <h2 id={`modules-${section.label}`} className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-muted">
              {section.label}
            </h2>
            <ul className="divide-y divide-[var(--shell-border)] rounded-[8px] border border-[var(--shell-border)]" role="list">
              {section.links.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="flex h-11 items-center gap-3 px-4 text-sm text-fg no-underline hover:bg-[var(--shell-hover)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--shell-focus)]"
                  >
                    <span aria-hidden="true" className="w-5 text-center text-fg-muted">
                      {item.icon}
                    </span>
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
