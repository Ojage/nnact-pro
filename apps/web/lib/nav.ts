// Shared navigation and auth helpers used by Sidebar, MobileNav, and CommandPalette.
// NNACT Pro is an open-source field-service operations platform with appliance-service workflows.

export interface NavLink {
  href: string;
  label: string;
  icon: string;
  /** [data-tour] id for the guided-walkthrough engine (see shared walkthroughs). */
  tour?: string;
}

export interface NavSection {
  label: string;
  links: NavLink[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Field",
    links: [
      { href: "/", label: "Today", icon: "◈" },
      { href: "/jobs/new", label: "New Job", icon: "＋", tour: "jobs-add" },
      { href: "/jobs", label: "Jobs", icon: "⊞", tour: "nav-jobs" },
      { href: "/diagnostics", label: "Diagnostics", icon: "⌁" },
    ],
  },
  {
    label: "Operations",
    links: [
      { href: "/dispatch", label: "Dispatch Board", icon: "⇄", tour: "nav-dispatch" },
      { href: "/schedule", label: "Schedule", icon: "◐" },
      { href: "/closeout", label: "Job Closeout", icon: "✓" },
      { href: "/pipeline", label: "Pipeline", icon: "⊟" },
      { href: "/customers", label: "Customers & Equipment", icon: "⊕", tour: "nav-customers" },
      { href: "/estimates", label: "Estimates", icon: "◷" },
      { href: "/invoices", label: "Invoices & Payments", icon: "◎", tour: "nav-invoices" },
      { href: "/service-plans", label: "Service Plans", icon: "◌" },
      { href: "/documents", label: "Documents", icon: "▤" },
      { href: "/price-book", label: "Price Book", icon: "⊡" },
    ],
  },
  {
    label: "Quality",
    links: [
      { href: "/repair-brain", label: "Repair Brain", icon: "◉", tour: "nav-repair-brain" },
      { href: "/diagnostic-library", label: "Diagnostic Library", icon: "⌘" },
      { href: "/coverage", label: "Coverage & Quality", icon: "◇" },
      { href: "/reviews", label: "Reviews", icon: "★" },
      { href: "/reports", label: "Reports", icon: "◫" },
    ],
  },
  {
    label: "System",
    links: [
      { href: "/integrations", label: "Integrations", icon: "⧉" },
      { href: "/settings", label: "Settings", icon: "⚙" },
    ],
  },
];

export const NAV_LINKS: NavLink[] = NAV_SECTIONS.flatMap((section) => section.links);

export function activeNavHref(pathname: string | null | undefined): string | null {
  if (!pathname) return null;
  const matches = NAV_LINKS.filter(({ href }) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`),
  );
  return matches.sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null;
}

export function decodeJwt(token: string): { name?: string; email?: string; role?: string } | null {
  try {
    return JSON.parse(atob(token.split(".")[1]));
  } catch {
    return null;
  }
}
