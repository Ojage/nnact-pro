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

/** Staff roles in NNACT Pro. Owner sees everything; the matrix below narrows the rest. */
export type NavRole = "owner" | "dispatcher" | "secretary" | "technician";

const ALL_ROLES: readonly NavRole[] = ["owner", "dispatcher", "secretary", "technician"];

/**
 * Route-prefix → roles that may see it. Longest matching prefix wins, so a
 * more specific rule (e.g. /repair-brain/workspace) overrides its parent.
 * Anything without a concrete rule falls through to ALL_ROLES so unknown /
 * future routes are never blocked silently.
 */
const ROUTE_ROLES: ReadonlyArray<readonly [string, readonly NavRole[]]> = [
  ["/repair-brain/workspace", ["owner", "dispatcher"]],
  ["/repair-brain", ALL_ROLES],
  ["/ai/usage", ["owner"]],
  ["/ai", ["owner"]],
  ["/content", ["owner"]],
  ["/publications", ["owner"]],
  ["/connections", ["owner"]],
  ["/newsletter", ["owner"]],
  ["/integrations", ["owner"]],
  ["/settings", ["owner"]],
  ["/dispatch", ["owner", "dispatcher"]],
  ["/schedule", ["owner", "dispatcher"]],
  ["/pipeline", ["owner", "dispatcher"]],
  ["/customers", ["owner", "dispatcher", "secretary"]],
  ["/equipment", ["owner", "dispatcher", "secretary"]],
  ["/estimates", ["owner", "dispatcher", "secretary"]],
  ["/invoices", ["owner", "dispatcher", "secretary"]],
  ["/service-plans", ["owner", "dispatcher", "secretary"]],
  ["/agreements", ["owner", "dispatcher", "secretary"]],
  ["/documents", ["owner", "dispatcher"]],
  ["/price-book", ["owner", "dispatcher"]],
  ["/finance/budgets", ["owner", "dispatcher"]],
  ["/finance/categories", ["owner", "dispatcher"]],
  ["/finance", ["owner", "dispatcher", "secretary"]],
  ["/diagnostic-library", ["owner", "dispatcher"]],
  ["/coverage", ["owner", "dispatcher"]],
  ["/reviews", ["owner", "dispatcher"]],
  ["/reports", ["owner", "dispatcher"]],
  ["/quality/comebacks", ["owner", "dispatcher"]],
];

export function rolesForRoute(pathname: string): readonly NavRole[] {
  let best: readonly NavRole[] | null = null;
  let bestLength = -1;
  for (const [route, roles] of ROUTE_ROLES) {
    const matches = route === "/" ? pathname === "/" : pathname === route || pathname.startsWith(`${route}/`);
    if (matches && route.length > bestLength) {
      bestLength = route.length;
      best = roles;
    }
  }
  return best ?? ALL_ROLES;
}

export function canAccessRoute(role: NavRole | null | undefined, pathname: string | null | undefined): boolean {
  if (!pathname) return true;
  return rolesForRoute(pathname).includes(role ?? "technician");
}

/** Full nav filtered to the links a role may see; empty sections are dropped. */
export function navSectionsForRole(role: NavRole | null | undefined): NavSection[] {
  const effective = role ?? "technician";
  return NAV_SECTIONS
    .map((section) => ({
      ...section,
      links: section.links.filter(({ href }) => rolesForRoute(href).includes(effective)),
    }))
    .filter((section) => section.links.length > 0);
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
      { href: "/documents", label: "Documents", icon: "▤" },
      { href: "/price-book", label: "Price Book", icon: "⊡" },
      { href: "/newsletter", label: "Newsletter", icon: "✉", tour: "nav-newsletter" },
    ],
  },
  {
    label: "Finance",
    links: [
      { href: "/finance", label: "Overview", icon: "⟡", tour: "nav-finance" },
      { href: "/invoices", label: "Invoices & Payments", icon: "◎", tour: "nav-invoices" },
      { href: "/estimates", label: "Estimates", icon: "◷" },
      { href: "/agreements", label: "Agreements", icon: "✍" },
      { href: "/service-plans", label: "Service Plans", icon: "◌" },
      { href: "/finance/expenses", label: "Expenses", icon: "↗" },
      { href: "/finance/bills", label: "Supplier Bills", icon: "◳" },
      { href: "/finance/advances", label: "Advances", icon: "⇧" },
      { href: "/finance/reimbursements", label: "Reimbursements", icon: "⇪" },
      { href: "/finance/petty-cash", label: "Petty Cash", icon: "⌀" },
      { href: "/finance/budgets", label: "Budgets", icon: "◇" },
      { href: "/finance/reports", label: "Reports", icon: "◫" },
      { href: "/finance/categories", label: "Setup", icon: "⚙" },
    ],
  },
  {
    label: "Marketing",
    links: [
      { href: "/content", label: "Content Studio", icon: "✎", tour: "nav-content" },
      { href: "/publications", label: "Publications", icon: "⇪", tour: "nav-publications" },
      { href: "/connections", label: "Channels", icon: "⇄", tour: "nav-connections" },
      { href: "/ai", label: "AI Content Automation", icon: "✳", tour: "nav-ai" },
      { href: "/ai/usage", label: "AI Usage Analytics", icon: "◩" },
    ],
  },
  {
    label: "Quality",
    links: [
      { href: "/repair-brain", label: "Repair Brain", icon: "◉", tour: "nav-repair-brain" },
      { href: "/repair-brain/workspace", label: "Model Workspace", icon: "▣" },
      { href: "/diagnostic-library", label: "Diagnostic Library", icon: "⌘" },
      { href: "/coverage", label: "Coverage & Quality", icon: "◇" },
      { href: "/quality/comebacks", label: "Comebacks", icon: "↩" },
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
