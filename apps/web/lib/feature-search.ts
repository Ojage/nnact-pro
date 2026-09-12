import { pickBestScore } from "@/lib/fuzzy";
import { rolesForRoute, type NavRole } from "@/lib/nav";

/** A discoverable "thing you can do in NNACT" — a page, a list, or a common ability. */
export interface FeatureCommand {
  id: string;
  title: string;
  group: string;
  href: string;
  icon: string;
  description?: string;
  keywords: string[];
  /** Explicit role allow-list; when absent, the target route's role rules decide. */
  roles?: readonly NavRole[];
}

export const FEATURE_COMMANDS: FeatureCommand[] = [
  // ── Pages from navigation ──────────────────────────────────────────
  { id: "today", title: "Today", group: "Field", href: "/", icon: "◈", description: "Dashboard of today's work", keywords: ["home", "dashboard", "start", "today's jobs"] },
  { id: "jobs", title: "Jobs", group: "Field", href: "/jobs", icon: "⊞", description: "All work orders and service calls", keywords: ["work orders", "jobs list", "all jobs", "service calls", "tickets"] },
  { id: "diagnostics", title: "Diagnostics", group: "Field", href: "/diagnostics", icon: "⌁", description: "Diagnostic sessions and tests", keywords: ["sessions", "tests", "diagnose", "fault finding"] },
  { id: "dispatch", title: "Dispatch Board", group: "Operations", href: "/dispatch", icon: "⇄", description: "Assign and route technicians", keywords: ["assign", "routing", "allocation", "technicians", "queue"] },
  { id: "schedule", title: "Schedule", group: "Operations", href: "/schedule", icon: "◐", description: "Calendar of appointments and visits", keywords: ["calendar", "appointments", "visits", "bookings", "slots"] },
  { id: "closeout", title: "Job Closeout", group: "Operations", href: "/closeout", icon: "✓", description: "Complete and close out jobs", keywords: ["complete job", "checklist", "wrap up", "finish", "sign off"] },
  { id: "pipeline", title: "Pipeline", group: "Operations", href: "/pipeline", icon: "⊟", description: "Kanban board of job stages", keywords: ["kanban", "board", "funnel", "stages", "status", "columns"] },
  { id: "customers", title: "Customers & Equipment", group: "Billing", href: "/customers", icon: "⊕", description: "Customers, contacts and their equipment", keywords: ["clients", "contacts", "assets", "equipment list", "customer list"] },
  { id: "estimates", title: "Estimates", group: "Billing", href: "/estimates", icon: "◷", description: "Quotes and quotations", keywords: ["quotes", "quotations", "pricing", "estimate list"] },
  { id: "invoices", title: "Invoices & Payments", group: "Billing", href: "/invoices", icon: "◎", description: "Bill customers and track payments", keywords: ["billing", "receipts", "payments", "invoice list", "sales"] },
  { id: "servicePlans", title: "Service Plans", group: "Billing", href: "/service-plans", icon: "◌", description: "Recurring maintenance plans", keywords: ["contracts", "maintenance plan", "subscription", "recurring"] },
  { id: "documents", title: "Documents", group: "Billing", href: "/documents", icon: "▤", description: "Uploaded files and records", keywords: ["files", "uploads", "attachments", "records", "photos"] },
  { id: "priceBook", title: "Price Book", group: "Billing", href: "/price-book", icon: "⊡", description: "Standard labor and part pricing", keywords: ["rates", "pricing", "rate card", "costs", "catalog"] },
  { id: "newsletter", title: "Newsletter", group: "Operations", href: "/newsletter", icon: "✉", description: "Email subscribers and blasts", keywords: ["subscribers", "campaign", "email list", "email blast", "marketing email"] },
  { id: "content", title: "Content Studio", group: "Marketing", href: "/content", icon: "✎", description: "Blogs, pages and SEO content", keywords: ["blog", "articles", "posts", "seo", "website"] },
  { id: "publications", title: "Publications", group: "Marketing", href: "/publications", icon: "⇪", description: "Published content and channels", keywords: ["published", "live", "channels"] },
  { id: "connections", title: "Channels", group: "Marketing", href: "/connections", icon: "⇄", description: "External channel connections", keywords: ["integrations", "social", "sso", "credentials"] },
  { id: "aiContent", title: "AI Content Automation", group: "Marketing", href: "/ai", icon: "✳", description: "Automated content generation", keywords: ["ai", "automation", "generate", "assistant", "auto"] },
  { id: "aiUsage", title: "AI Usage Analytics", group: "Marketing", href: "/ai/usage", icon: "◩", description: "AI credit usage and spend", keywords: ["usage", "credits", "spend", "limits"] },
  { id: "repairBrain", title: "Repair Brain", group: "Quality", href: "/repair-brain", icon: "◉", description: "Knowledge base of faults, procedures and parts", keywords: ["knowledge base", "faults", "procedures", "search knowledge", "proposals", "review"] },
  { id: "modelWorkspace", title: "Model Workspace", group: "Quality", href: "/repair-brain/workspace", icon: "▣", description: "Manage model-level knowledge", keywords: ["workspace", "manage knowledge", "models", "approve"] },
  { id: "models", title: "Equipment Models", group: "Quality", href: "/repair-brain/models", icon: "▦", description: "Catalog of equipment models", keywords: ["model catalog", "products", "appliances", "make model"] },
  { id: "diagnosticLibrary", title: "Diagnostic Library", group: "Quality", href: "/diagnostic-library", icon: "⌘", description: "Diagnostic templates and worksheets", keywords: ["templates", "worksheets", "diagnosis templates"] },
  { id: "coverage", title: "Coverage & Quality", group: "Quality", href: "/coverage", icon: "◇", description: "Service area coverage and quality", keywords: ["service coverage", "field coverage", "territory", "quality"] },
  { id: "reviews", title: "Reviews", group: "Quality", href: "/reviews", icon: "★", description: "Customer ratings and feedback", keywords: ["ratings", "feedback", "testimonials", "stars"] },
  { id: "reports", title: "Reports", group: "Quality", href: "/reports", icon: "◫", description: "Analytics, exports and KPIs", keywords: ["analytics", "exports", "kpis", "metrics", "charts"] },
  { id: "integrations", title: "Integrations", group: "System", href: "/integrations", icon: "⧉", description: "Third-party integrations", keywords: ["apps", "connect", "webhooks", "plugins"] },
  { id: "settings", title: "Settings", group: "System", href: "/settings", icon: "⚙", description: "Company, team and account settings", keywords: ["company", "profile", "team", "members", "users", "account", "preferences"] },

  // ── Create / quick abilities ───────────────────────────────────────
  { id: "newJob", title: "Create a New Job", group: "Create", href: "/jobs/new", icon: "＋", description: "Start a new work order", keywords: ["add job", "create job", "new work order", "service call", "quick add"], roles: ["owner", "dispatcher", "technician"] },
  { id: "newCustomer", title: "Add a Customer", group: "Create", href: "/customers", icon: "＋", description: "Register a new customer or contact", keywords: ["add customer", "new customer", "create customer", "add client", "register customer"] },
  { id: "newDiagnostics", title: "Run Diagnostics", group: "Create", href: "/diagnostics/new", icon: "＋", description: "Start a new diagnostic session", keywords: ["diagnose", "run diagnosis", "new session", "start diagnosis"] },
  { id: "newEstimate", title: "Create an Estimate", group: "Create", href: "/estimates", icon: "＋", description: "Draft a quote for a customer", keywords: ["new quote", "add estimate", "quotation", "estimate job"] },
  { id: "newInvoice", title: "Create an Invoice", group: "Create", href: "/invoices", icon: "＋", description: "Send an invoice to a customer", keywords: ["send invoice", "bill customer", "add invoice", "charge"] },
  { id: "newDocument", title: "Upload a Document", group: "Create", href: "/documents", icon: "＋", description: "Attach a file or record", keywords: ["add document", "upload", "attach file"] },
  { id: "newContent", title: "Write a Post", group: "Create", href: "/content/new", icon: "＋", description: "Draft a blog post or page", keywords: ["blog", "article", "write content", "publish post"] },

  // ── Common abilities (maps to nearest page) ────────────────────────
  { id: "scheduleJob", title: "Schedule an Appointment", group: "Create", href: "/schedule", icon: "◐", description: "Book a visit or appointment", keywords: ["book appointment", "schedule visit", "book a job", "add appointment"] },
  { id: "assignTech", title: "Assign a Technician", group: "Create", href: "/dispatch", icon: "⇄", description: "Route work to a technician", keywords: ["assign", "assign tech", "route job", "delegate"] },
  { id: "trackPayments", title: "Track Payments", group: "Billing", href: "/invoices", icon: "◎", description: "See what customers owe", keywords: ["payments", "owe", "paid", "outstanding", "receivable"] },
  { id: "reviewKnowledge", title: "Review Knowledge Proposals", group: "Quality", href: "/repair-brain", icon: "◉", description: "Approve or reject proposed knowledge", keywords: ["proposals", "approve", "verify", "review knowledge"] },
  { id: "importKnowledge", title: "Import Repair Knowledge", group: "Quality", href: "/repair-brain", icon: "＋", description: "Bulk add models, faults and parts", keywords: ["import", "bulk add", "csv", "json", "upload knowledge"] },
  { id: "checkCoverage", title: "Check Coverage", group: "Quality", href: "/coverage", icon: "◇", description: "See service area coverage", keywords: ["coverage", "territory", "area", "zones"] },
  { id: "exportReport", title: "Export a Report", group: "Quality", href: "/reports", icon: "◫", description: "Download analytics or KPI reports", keywords: ["export", "download", "pdf", "csv", "kpi", "analytics"] },
  { id: "manageTeam", title: "Manage Team Members", group: "System", href: "/settings", icon: "⚙", description: "Invite, edit or remove staff", keywords: ["invite member", "add user", "team", "staff", "roles", "permissions"] },
  { id: "managePriceList", title: "Manage the Price Book", group: "Billing", href: "/price-book", icon: "⊡", description: "Update labor and part pricing", keywords: ["prices", "rate card", "rates", "update pricing"] },
];

/** Fuzzy-search the feature catalog, honoring the viewer's role. */
export function searchFeatureCommands(query: string, role?: NavRole | null): FeatureCommand[] {
  const effective = role ?? "technician";
  const q = query.trim();
  if (!q) return [];
  const scored = FEATURE_COMMANDS.map((command) => {
    const visible = command.roles ? command.roles.includes(effective) : rolesForRoute(command.href).includes(effective);
    if (!visible) return null;
    const score = pickBestScore(q, [command.title, command.description ?? "", ...command.keywords]);
    if (score <= 0) return null;
    return { command, score };
  }).filter((x): x is { command: FeatureCommand; score: number } => x !== null);
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map(({ command }) => command);
}