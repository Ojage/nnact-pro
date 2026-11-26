import { FEATURE_COMMANDS } from "@/lib/feature-search";
import { fuzzyScore } from "@/lib/fuzzy";
import { NAV_SECTIONS, rolesForRoute, type NavRole } from "@/lib/nav";

export type ModuleIconName =
  | "activity"
  | "agents"
  | "billing"
  | "book"
  | "calendar"
  | "chart"
  | "check"
  | "clipboard"
  | "command"
  | "credit-card"
  | "database"
  | "file"
  | "finance"
  | "grid"
  | "help"
  | "home"
  | "image"
  | "mail"
  | "megaphone"
  | "news"
  | "plug"
  | "search"
  | "settings"
  | "shield"
  | "sparkles"
  | "star"
  | "tools"
  | "trend"
  | "users"
  | "wallet"
  | "wrench";

export interface ModuleEntry {
  id: string;
  href: string;
  label: string;
  section: string;
  icon: ModuleIconName;
  description: string;
  keywords: string[];
  roles: readonly NavRole[];
}

export type ModuleFilter = "all" | "favorites" | "recent";
export type ModuleSort = "relevance" | "name" | "section";

export interface ModuleSearchOptions {
  query?: string;
  sections?: string[];
  filter?: ModuleFilter;
  sort?: ModuleSort;
  favorites?: string[];
  recent?: string[];
}

export interface ModuleSearchResult {
  entry: ModuleEntry;
  score: number;
}

interface ModuleMeta {
  description: string;
  keywords: string[];
  icon: ModuleIconName;
}

const MODULE_META: Record<string, ModuleMeta> = {
  "/": {
    description: "Your daily command center for assigned work, approvals, and business health.",
    keywords: ["home", "dashboard", "overview", "today"],
    icon: "home",
  },
  "/jobs/new": {
    description: "Create a job, capture customer details, and start a new service workflow.",
    keywords: ["new job", "create", "intake", "service"],
    icon: "clipboard",
  },
  "/jobs": {
    description: "Search, triage, and manage every job from intake through closeout.",
    keywords: ["work orders", "service", "queue", "operations"],
    icon: "clipboard",
  },
  "/diagnostics": {
    description: "Run guided troubleshooting and inspect diagnostic activity across jobs.",
    keywords: ["troubleshooting", "tests", "repair", "faults"],
    icon: "activity",
  },
  "/agents": {
    description: "Monitor the agent fleet, approvals, run history, and automation health.",
    keywords: ["agent office", "automation", "workers", "runs"],
    icon: "agents",
  },
  "/agent/copilot": {
    description: "Review AI copilot suggestions without sending messages or changing records.",
    keywords: ["copilot", "suggestions", "assistant", "review"],
    icon: "sparkles",
  },
  "/agent/drafts": {
    description: "Review and edit AI-drafted customer communications before they are sent.",
    keywords: ["drafts", "messages", "email", "sms", "approval"],
    icon: "mail",
  },
  "/agent/quotes": {
    description: "Inspect AI-generated quote drafts, assumptions, and estimate proposals.",
    keywords: ["estimates", "proposals", "pricing", "approval"],
    icon: "file",
  },
  "/agent/price-book": {
    description: "Review proposed price changes before they are published to the catalog.",
    keywords: ["pricing", "rates", "proposals", "approval"],
    icon: "wallet",
  },
  "/dispatch": {
    description: "Assign technicians, balance the schedule, and keep field work moving.",
    keywords: ["assign", "technicians", "schedule", "board"],
    icon: "calendar",
  },
  "/schedule": {
    description: "Plan upcoming work, appointments, and technician availability.",
    keywords: ["calendar", "appointments", "planning", "capacity"],
    icon: "calendar",
  },
  "/closeout": {
    description: "Complete job closeout, invoices, notes, and final quality checks.",
    keywords: ["complete", "finish", "invoice", "quality"],
    icon: "check",
  },
  "/pipeline": {
    description: "Track operational throughput and work in progress across stages.",
    keywords: ["workflow", "stages", "throughput", "queue"],
    icon: "trend",
  },
  "/customers": {
    description: "Manage customer records, contacts, sites, and service history.",
    keywords: ["clients", "contacts", "companies", "crm"],
    icon: "users",
  },
  "/documents": {
    description: "Store and retrieve job documents, attachments, and shared files.",
    keywords: ["files", "attachments", "paperwork", "library"],
    icon: "file",
  },
  "/price-book": {
    description: "Maintain service items, labor rates, parts pricing, and price rules.",
    keywords: ["pricing", "services", "rates", "catalog"],
    icon: "wallet",
  },
  "/newsletter": {
    description: "Prepare and review customer newsletters and broadcast content.",
    keywords: ["email", "broadcast", "campaign", "content"],
    icon: "mail",
  },
  "/finance": {
    description: "Get a financial overview of cash flow, receivables, and obligations.",
    keywords: ["money", "overview", "cash flow", "accounting"],
    icon: "finance",
  },
  "/invoices": {
    description: "Create, send, track, and reconcile customer invoices and payments.",
    keywords: ["billing", "receivables", "payments", "statements"],
    icon: "billing",
  },
  "/estimates": {
    description: "Build estimates, quote work, and track approvals before jobs begin.",
    keywords: ["quotes", "proposals", "pricing", "sales"],
    icon: "file",
  },
  "/agreements": {
    description: "Manage service agreements, maintenance plans, and contract terms.",
    keywords: ["contracts", "plans", "maintenance", "terms"],
    icon: "file",
  },
  "/service-plans": {
    description: "Configure recurring service plans, coverages, and plan benefits.",
    keywords: ["maintenance", "recurring", "coverage", "memberships"],
    icon: "shield",
  },
  "/finance/expenses": {
    description: "Record and categorize operating expenses across the business.",
    keywords: ["spend", "costs", "ledger", "accounting"],
    icon: "credit-card",
  },
  "/finance/bills": {
    description: "Track supplier bills, due dates, approvals, and payment status.",
    keywords: ["accounts payable", "vendors", "suppliers", "invoices"],
    icon: "billing",
  },
  "/finance/advances": {
    description: "Review and manage employee or vendor cash advances.",
    keywords: ["cash", "employee", "vendor", "reconciliation"],
    icon: "wallet",
  },
  "/finance/reimbursements": {
    description: "Submit, review, and approve employee expense reimbursements.",
    keywords: ["expenses", "employees", "approval", "payments"],
    icon: "wallet",
  },
  "/finance/petty-cash": {
    description: "Track small cash purchases, custodians, and petty cash balances.",
    keywords: ["cash", "small purchases", "float", "ledger"],
    icon: "wallet",
  },
  "/finance/budgets": {
    description: "Set budgets and compare planned spend with actual results.",
    keywords: ["planning", "forecast", "spend", "variance"],
    icon: "chart",
  },
  "/finance/reports": {
    description: "Build financial reports for revenue, margin, cash flow, and spend.",
    keywords: ["analytics", "accounting", "pnl", "statements"],
    icon: "chart",
  },
  "/finance/categories": {
    description: "Organize chart-of-accounts categories used across finance workflows.",
    keywords: ["ledger", "accounts", "tags", "classification"],
    icon: "grid",
  },
  "/content": {
    description: "Plan, write, and manage marketing content before publication.",
    keywords: ["writing", "editorial", "blog", "assets"],
    icon: "file",
  },
  "/content/gallery": {
    description: "Browse reusable media, images, and creative assets.",
    keywords: ["images", "media", "assets", "library"],
    icon: "image",
  },
  "/publications": {
    description: "Publish and track newsletters, posts, and public-facing updates.",
    keywords: ["publishing", "blog", "newsletter", "campaigns"],
    icon: "news",
  },
  "/connections": {
    description: "Connect communication channels and external publishing accounts.",
    keywords: ["integrations", "accounts", "channels", "oauth"],
    icon: "plug",
  },
  "/ai": {
    description: "Configure AI writing assistance and review generated marketing content.",
    keywords: ["generative", "writing", "assistant", "content"],
    icon: "sparkles",
  },
  "/ai/usage": {
    description: "Inspect AI usage, token spend, volume, and cost trends.",
    keywords: ["tokens", "cost", "analytics", "spend"],
    icon: "chart",
  },
  "/repair-brain": {
    description: "Explore known faults, fixes, and technical knowledge from completed work.",
    keywords: ["knowledge base", "fixes", "faults", "diagnostics"],
    icon: "book",
  },
  "/repair-brain/workspace": {
    description: "Curate repair knowledge, confirm patterns, and maintain trusted guidance.",
    keywords: ["knowledge", "curation", "quality", "fixes"],
    icon: "book",
  },
  "/diagnostic-library": {
    description: "Maintain structured diagnostic procedures and decision paths.",
    keywords: ["procedures", "tests", "troubleshooting", "library"],
    icon: "activity",
  },
  "/coverage": {
    description: "Check which equipment, systems, and issues have trusted repair coverage.",
    keywords: ["equipment", "knowledge", "gaps", "support"],
    icon: "shield",
  },
  "/quality/comebacks": {
    description: "Review repeat visits, root causes, and quality trends after completion.",
    keywords: ["repeat visits", "warranty", "quality", "root cause"],
    icon: "activity",
  },
  "/reviews": {
    description: "Monitor customer feedback and public reviews across locations.",
    keywords: ["feedback", "ratings", "reputation", "surveys"],
    icon: "star",
  },
  "/reports": {
    description: "Build operational reports across jobs, quality, finance, and growth.",
    keywords: ["analytics", "metrics", "dashboards", "insights"],
    icon: "chart",
  },
  "/growth/intelligence": {
    description: "Turn customer and market signals into prioritized growth opportunities.",
    keywords: ["signals", "insights", "opportunities", "research"],
    icon: "sparkles",
  },
  "/growth/knowledge": {
    description: "Manage growth playbooks, messaging, and reusable campaign knowledge.",
    keywords: ["playbooks", "messaging", "content", "library"],
    icon: "book",
  },
  "/growth/autopilot": {
    description: "Supervise automated growth workflows and review suggested actions.",
    keywords: ["automation", "campaigns", "agents", "review"],
    icon: "sparkles",
  },
  "/growth/inbox": {
    description: "Review inbound growth conversations, leads, and campaign replies.",
    keywords: ["leads", "messages", "replies", "email"],
    icon: "mail",
  },
  "/growth/pipeline": {
    description: "Track sales opportunities from first contact through handoff.",
    keywords: ["sales", "deals", "stages", "crm"],
    icon: "trend",
  },
  "/growth/analytics": {
    description: "Measure campaign performance, funnel conversion, and revenue impact.",
    keywords: ["metrics", "conversion", "campaigns", "roi"],
    icon: "chart",
  },
  "/growth": {
    description: "Open the growth workspace and coordinate marketing activity.",
    keywords: ["marketing", "campaigns", "workspace", "overview"],
    icon: "megaphone",
  },
  "/growth/campaigns": {
    description: "Create, schedule, and monitor multi-channel marketing campaigns.",
    keywords: ["email", "sms", "marketing", "outreach"],
    icon: "megaphone",
  },
  "/growth/senders": {
    description: "Manage approved sender identities used for outbound campaigns.",
    keywords: ["from address", "domains", "identity", "email"],
    icon: "users",
  },
  "/growth/suppressions": {
    description: "Maintain suppression lists to prevent unwanted outbound messages.",
    keywords: ["opt out", "blacklist", "compliance", "email"],
    icon: "shield",
  },
  "/help/faq": {
    description: "Find answers, guides, and operational documentation.",
    keywords: ["help", "support", "docs", "questions"],
    icon: "help",
  },
  "/integrations": {
    description: "Configure external services, API credentials, and connected tools.",
    keywords: ["api", "webhooks", "connections", "settings"],
    icon: "plug",
  },
  "/settings": {
    description: "Manage workspace preferences, users, permissions, and configuration.",
    keywords: ["preferences", "account", "permissions", "admin"],
    icon: "settings",
  },
  "/modules": {
    description: "Browse every module available to your role with search and filters.",
    keywords: ["catalog", "products", "features", "navigation"],
    icon: "grid",
  },
};

const FEATURE_BY_HREF = new Map(FEATURE_COMMANDS.map((command) => [command.href, command]));

function idForHref(href: string): string {
  if (href === "/") return "home";
  return (
    href
      .replace(/^\/+|\/+$/g, "")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "") || "home"
  );
}

function asNavRole(role: string | undefined): NavRole {
  if (role === "owner" || role === "dispatcher" || role === "secretary" || role === "technician") {
    return role;
  }
  return "technician";
}

export const MODULE_CATALOG: ModuleEntry[] = NAV_SECTIONS.flatMap((section) =>
  section.links.map((link) => {
    const meta = MODULE_META[link.href] ?? {
      description: FEATURE_BY_HREF.get(link.href)?.description ?? `Open ${link.label}.`,
      keywords: FEATURE_BY_HREF.get(link.href)?.keywords ?? [link.label, section.label],
      icon: "grid" as const,
    };
    return {
      id: idForHref(link.href),
      href: link.href,
      label: link.label,
      section: section.label,
      icon: meta.icon,
      description: meta.description,
      keywords: [...meta.keywords, link.label, section.label],
      roles: rolesForRoute(link.href),
    };
  }),
);

export const MODULE_SECTIONS = NAV_SECTIONS.map((section) => section.label);

export function modulesForRole(role: string | undefined): ModuleEntry[] {
  const navRole = asNavRole(role);
  return MODULE_CATALOG.filter((entry) => entry.roles.includes(navRole));
}

function scoreEntry(entry: ModuleEntry, query: string): number {
  const phrase = query.trim().toLowerCase();
  if (!phrase) return 1;

  let score = 0;
  for (const term of phrase.split(/\s+/).filter(Boolean)) {
    const best = Math.max(
      fuzzyScore(term, entry.label) * 2.6,
      fuzzyScore(term, entry.keywords.join(" ")) * 1.35,
      fuzzyScore(term, entry.description) * 1,
      fuzzyScore(term, entry.section) * 0.9,
      fuzzyScore(term, entry.href) * 0.6,
    );
    if (!best) return 0;
    score += best;
  }

  if (entry.label.toLowerCase() === phrase) score += 300;
  else if (entry.label.toLowerCase().startsWith(phrase)) score += 150;
  else if (entry.label.toLowerCase().includes(phrase)) score += 90;

  return score / Math.max(phrase.split(/\s+/).length, 1);
}

export function searchModules(entries: ModuleEntry[], options: ModuleSearchOptions = {}): ModuleSearchResult[] {
  const query = options.query?.trim() ?? "";
  const sections = options.sections ?? [];
  const filter = options.filter ?? "all";
  const sort = options.sort ?? (query ? "relevance" : "name");
  const favorites = new Set(options.favorites ?? []);
  const recent = new Set(options.recent ?? []);

  const results = entries
    .filter((entry) => (sections.length ? sections.includes(entry.section) : true))
    .filter((entry) => {
      if (filter === "favorites") return favorites.has(entry.href);
      if (filter === "recent") return recent.has(entry.href);
      return true;
    })
    .map((entry) => ({ entry, score: scoreEntry(entry, query) }))
    .filter((result) => result.score > 0);

  results.sort((a, b) => {
    if (sort === "relevance" && query) {
      if (b.score !== a.score) return b.score - a.score;
      return a.entry.label.localeCompare(b.entry.label);
    }
    if (sort === "section") {
      const bySection = a.entry.section.localeCompare(b.entry.section);
      return bySection || a.entry.label.localeCompare(b.entry.label);
    }
    return a.entry.label.localeCompare(b.entry.label);
  });

  return results;
}

export function sectionCounts(entries: ModuleEntry[]): Record<string, number> {
  return entries.reduce<Record<string, number>>((counts, entry) => {
    counts[entry.section] = (counts[entry.section] ?? 0) + 1;
    return counts;
  }, {});
}

export function relatedModules(entries: ModuleEntry[], entry: ModuleEntry, limit = 4): ModuleEntry[] {
  return entries
    .filter((candidate) => candidate.href !== entry.href && candidate.section === entry.section)
    .sort((a, b) => a.label.localeCompare(b.label))
    .slice(0, limit);
}

export function highlightRanges(text: string, query: string): Array<{ start: number; end: number }> {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean);
  if (!terms.length) return [];

  const lower = text.toLowerCase();
  const ranges: Array<{ start: number; end: number }> = [];
  for (const term of terms) {
    let from = 0;
    let index = lower.indexOf(term, from);
    while (index !== -1) {
      ranges.push({ start: index, end: index + term.length });
      from = index + term.length;
      index = lower.indexOf(term, from);
    }
  }

  ranges.sort((a, b) => a.start - b.start || b.end - a.end);
  return ranges.reduce<Array<{ start: number; end: number }>>((merged, range) => {
    const previous = merged[merged.length - 1];
    if (previous && range.start <= previous.end) {
      previous.end = Math.max(previous.end, range.end);
      return merged;
    }
    merged.push({ ...range });
    return merged;
  }, []);
}
