// Shared navigation links and auth helpers used by Sidebar and MobileNav

export const NAV_LINKS = [
  { href: "/", label: "Dashboard", icon: "◈" },
  { href: "/pipeline", label: "Pipeline", icon: "⊟" },
  { href: "/jobs", label: "Jobs", icon: "⊞" },
  { href: "/customers", label: "Customers", icon: "⊕" },
  { href: "/schedule", label: "Schedule", icon: "◐" },
  { href: "/estimates", label: "Estimates", icon: "◷" },
  { href: "/invoices", label: "Invoices", icon: "◎" },
  { href: "/price-book", label: "Price Book", icon: "⊡" },
  { href: "/reviews", label: "Reviews", icon: "★" },
  { href: "/reports", label: "Reports", icon: "◫" },
] as const;

export function decodeJwt(token: string): { name?: string; email?: string } | null {
  try {
    return JSON.parse(atob(token.split(".")[1]));
  } catch {
    return null;
  }
}
