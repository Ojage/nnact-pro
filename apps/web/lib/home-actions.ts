// What the home page offers each role: quick action chips and the "Quick
// access" module tiles. Every entry is also checked against the route-role
// table in lib/nav.ts, so the home page never offers a page the role cannot
// open (the server enforces access regardless).
import { canAccessRoute, type NavRole } from "@/lib/nav";

export interface HomeAction {
  href: string;
  label: string;
  /** lucide icon name, resolved by the component. */
  icon: HomeIconName;
}

export type HomeIconName =
  | "plus"
  | "dispatch"
  | "drafts"
  | "quotes"
  | "invoice"
  | "agents"
  | "schedule"
  | "closeout"
  | "customers"
  | "estimates"
  | "diagnostics"
  | "jobs"
  | "finance"
  | "pricebook"
  | "brain"
  | "reports"
  | "growth"
  | "settings";

const ACTIONS: Record<NavRole, HomeAction[]> = {
  owner: [
    { href: "/jobs/new", label: "New job", icon: "plus" },
    { href: "/dispatch", label: "Open dispatch", icon: "dispatch" },
    { href: "/agent/drafts", label: "Review draft jobs", icon: "drafts" },
    { href: "/agent/quotes", label: "Approve quote proposals", icon: "quotes" },
    { href: "/closeout", label: "Close out jobs", icon: "closeout" },
    { href: "/agents", label: "Agent Office", icon: "agents" },
  ],
  dispatcher: [
    { href: "/jobs/new", label: "New job", icon: "plus" },
    { href: "/dispatch", label: "Open dispatch", icon: "dispatch" },
    { href: "/agent/drafts", label: "Review draft jobs", icon: "drafts" },
    { href: "/schedule", label: "Schedule", icon: "schedule" },
    { href: "/closeout", label: "Close out jobs", icon: "closeout" },
  ],
  secretary: [
    { href: "/jobs/new", label: "New job", icon: "plus" },
    { href: "/customers", label: "Find a customer", icon: "customers" },
    { href: "/invoices", label: "Invoices and payments", icon: "invoice" },
    { href: "/estimates", label: "Estimates", icon: "estimates" },
  ],
  technician: [
    { href: "/jobs", label: "My jobs", icon: "jobs" },
    { href: "/diagnostics", label: "Start diagnostics", icon: "diagnostics" },
    { href: "/repair-brain", label: "Repair Brain", icon: "brain" },
  ],
};

const MODULES: HomeAction[] = [
  { href: "/jobs", label: "Jobs", icon: "jobs" },
  { href: "/dispatch", label: "Dispatch Board", icon: "dispatch" },
  { href: "/schedule", label: "Schedule", icon: "schedule" },
  { href: "/customers", label: "Customers & Equipment", icon: "customers" },
  { href: "/invoices", label: "Invoices & Payments", icon: "invoice" },
  { href: "/estimates", label: "Estimates", icon: "estimates" },
  { href: "/finance", label: "Finance", icon: "finance" },
  { href: "/price-book", label: "Price Book", icon: "pricebook" },
  { href: "/agents", label: "Agent Office", icon: "agents" },
  { href: "/repair-brain", label: "Repair Brain", icon: "brain" },
  { href: "/diagnostics", label: "Diagnostics", icon: "diagnostics" },
  { href: "/reports", label: "Reports", icon: "reports" },
  { href: "/growth", label: "Growth", icon: "growth" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

function asRole(role: string | null | undefined): NavRole {
  return role === "owner" || role === "dispatcher" || role === "secretary" ? role : "technician";
}

/** Quick action chips for a role, limited to pages that role may open. */
export function quickActionsFor(role: string | null | undefined): HomeAction[] {
  const effective = asRole(role);
  return ACTIONS[effective].filter((action) => canAccessRoute(effective, action.href));
}

/** Module tiles for a role, in a fixed order, limited to pages that role may open. */
export function quickAccessFor(role: string | null | undefined, limit = 8): HomeAction[] {
  const effective = asRole(role);
  return MODULES.filter((module) => canAccessRoute(effective, module.href)).slice(0, limit);
}
