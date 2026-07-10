// Shared navigation and auth helpers used by Sidebar, MobileNav, and CommandPalette.
// OpenFieldPro keeps the complete field-service operations core while making
// appliance diagnostic execution the primary field workflow.

export const NAV_SECTIONS = [
  {
    label: "Field",
    links: [
      { href: "/", label: "Today", icon: "◈" },
      { href: "/jobs", label: "Jobs", icon: "⊞" },
      { href: "/diagnostics", label: "Diagnostics", icon: "⌁" },
    ],
  },
  {
    label: "Operations",
    links: [
      { href: "/schedule", label: "Schedule & Dispatch", icon: "◐" },
      { href: "/pipeline", label: "Pipeline", icon: "⊟" },
      { href: "/customers", label: "Customers & Equipment", icon: "⊕" },
      { href: "/estimates", label: "Estimates", icon: "◷" },
      { href: "/invoices", label: "Invoices & Payments", icon: "◎" },
      { href: "/service-plans", label: "Service Plans", icon: "◌" },
      { href: "/documents", label: "Documents", icon: "▤" },
      { href: "/price-book", label: "Price Book", icon: "⊡" },
    ],
  },
  {
    label: "Quality",
    links: [
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
] as const;

export const NAV_LINKS = NAV_SECTIONS.flatMap((section) => section.links);

export function decodeJwt(token: string): { name?: string; email?: string; role?: string } | null {
  try {
    return JSON.parse(atob(token.split(".")[1]));
  } catch {
    return null;
  }
}
