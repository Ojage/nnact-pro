"use client";

import {
  Bell,
  Blocks,
  Building2,
  CalendarClock,
  CheckCircle2,
  Circle,
  CircleHelp,
  Coins,
  CreditCard,
  FileText,
  Hash,
  MapPin,
  MessageSquare,
  Percent,
  Plug,
  Settings,
  Smartphone,
  UserCog,
  Users,
} from "lucide-react";
import { PrefetchLink as Link } from "@/components/prefetch-link";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrgQuery, useUsersQuery } from "@/lib/redux/api";
import { requestLearn } from "@/lib/walkthroughs/events";
import {
  ConsolePage,
  DetailsCard,
  MeterList,
  Panel,
  ProductTiles,
  ServiceOverviewHero,
  SummaryCards,
  illustrationSrc,
} from "@/components/console";

const viewAll = "text-sm font-medium text-[var(--shell-accent-text)] hover:underline";
const ROLES = ["owner", "dispatcher", "secretary", "technician"] as const;

/** System overview: organisation setup progress, team and every settings area. */
export default function SystemOverviewPage() {
  const { data: org, isLoading } = useOrgQuery();
  const { data: users = [] } = useUsersQuery();

  if (isLoading) {
    return (
      <div className="grid gap-6" aria-busy="true" aria-label="Loading system overview">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
          <Skeleton className="h-44 rounded-[8px]" />
          <Skeleton className="h-44 rounded-[8px]" />
        </div>
        <Skeleton className="h-64 rounded-[8px]" />
      </div>
    );
  }

  const active = users.filter((u) => u.active);
  const checklist = [
    { done: Boolean(org?.name), label: "Company name", href: "/settings?section=company" },
    { done: Boolean(org?.logoUrl), label: "Logo for documents", href: "/settings?section=company" },
    { done: Boolean(org?.publicEmail && org?.publicPhone), label: "Public email and phone", href: "/settings?section=company" },
    { done: Boolean(org?.publicAddress), label: "Business address", href: "/settings?section=company" },
    { done: Boolean(org?.signatoryName), label: "Signatory for estimates and invoices", href: "/settings?section=company" },
    { done: active.length > 1, label: "Invite your team", href: "/settings?section=team" },
  ];
  const done = checklist.filter((item) => item.done).length;

  return (
    <ConsolePage className="gap-6">
      <ServiceOverviewHero
        title="System"
        icon={Settings}
        description="Set up your company once: the details printed on documents, business hours, prices and taxes, how customers pay, and who on the team can do what."
        quickActions={[
          { label: "Company profile", href: "/settings?section=company", icon: Building2 },
          { label: "Manage the team", href: "/settings?section=team", icon: Users },
          { label: "Payments", href: "/settings?section=payments", icon: CreditCard },
          { label: "Integrations", href: "/integrations", icon: Plug },
          { label: "Help and FAQ", href: "/help/faq", icon: CircleHelp },
        ]}
        illustration={{
          image: illustrationSrc("system"),
          icon: Settings,
          title: "A few minutes of setup, every document right.",
          copy: "Company details, numbering and taxes flow into every estimate, invoice and message.",
          links: [
            { label: "Start a walkthrough", onClick: () => requestLearn() },
            { label: "Read the FAQ", href: "/help/faq" },
          ],
        }}
      />

      <SummaryCards
        label="System at a glance"
        items={[
          { label: "Setup progress", icon: CheckCircle2, value: `${done} / ${checklist.length}`, meter: done / checklist.length, note: done === checklist.length ? "Everything is set up" : "Steps left below", attention: done < checklist.length },
          { label: "Active team members", icon: Users, value: active.length, note: `${users.length - active.length} deactivated`, href: "/settings?section=team" },
          { label: "Time zone", icon: CalendarClock, value: org?.timezone ?? "—", note: "Used for schedules and reminders", href: "/settings?section=hours" },
        ]}
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Getting started" description="Finish these so documents and messages look right">
          <ol className="grid gap-1" role="list">
            {checklist.map((item) => (
              <li key={item.label}>
                <Link href={item.href} className="flex items-center gap-2 rounded-[6px] px-1 py-1.5 text-sm text-fg no-underline hover:bg-[var(--shell-canvas)] hover:no-underline">
                  {item.done ? (
                    <CheckCircle2 className="size-4 shrink-0 text-[var(--console-success-fg)]" aria-hidden="true" />
                  ) : (
                    <Circle className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
                  )}
                  <span className="min-w-0 flex-1">{item.label}</span>
                  <span className="text-xs text-fg-muted">{item.done ? "Done" : "To do"}</span>
                </Link>
              </li>
            ))}
          </ol>
        </Panel>
        <Panel title="Team by role" actions={<Link href="/settings?section=team" className={viewAll}>Manage</Link>}>
          <MeterList
            empty="No team members yet."
            rows={ROLES.map((role) => {
              const count = active.filter((u) => u.role === role).length;
              return { id: role, label: role.charAt(0).toUpperCase() + role.slice(1), value: count, of: Math.max(1, active.length), valueText: String(count) };
            })}
          />
        </Panel>
        <DetailsCard
          title="Organisation"
          actions={<Link href="/settings?section=company" className={viewAll}>Edit</Link>}
          termWidth="7rem"
          rows={[
            ["Name", org?.name],
            ["Email", org?.publicEmail],
            ["Phone", org?.publicPhone],
            ["Address", org?.publicAddress],
            ["Registration", org?.registrationNumber],
          ]}
        />
      </div>

      <ProductTiles
        title="Settings areas"
        tiles={[
          { href: "/settings?section=company", icon: Building2, name: "Company", description: "Name, logo, contact details and signatory." },
          { href: "/settings?section=hours", icon: CalendarClock, name: "Business Hours", description: "When you take jobs and send reminders." },
          { href: "/settings?section=areas", icon: MapPin, name: "Service Areas", description: "Where your technicians travel." },
          { href: "/settings?section=invoice", icon: FileText, name: "Invoices & Estimates", description: "Document layout, terms and notes." },
          { href: "/settings?section=payments", icon: CreditCard, name: "Payments", description: "Mobile money, cards and payment links." },
          { href: "/settings?section=taxes", icon: Percent, name: "Taxes & Discounts", description: "Tax rates and saved discounts." },
          { href: "/settings?section=messages", icon: MessageSquare, name: "Messages", description: "Templates for SMS and email." },
          { href: "/settings?section=numbering", icon: Hash, name: "Numbering", description: "Job, estimate and invoice numbers." },
          { href: "/settings?section=currency", icon: Coins, name: "Currency", description: "Currency and number format." },
          { href: "/settings?section=sms", icon: Smartphone, name: "SMS Provider", description: "Which gateway sends text messages." },
          { href: "/settings?section=portal", icon: Bell, name: "Customer Portal", description: "What customers can see and pay online." },
          { href: "/settings?section=team", icon: UserCog, name: "Team", description: "People, roles and access." },
          { href: "/integrations", icon: Plug, name: "Integrations", description: "Accounting, messaging and other connected apps." },
          { href: "/modules", icon: Blocks, name: "Modules", description: "Turn product areas on or off." },
          { href: "/help/faq", icon: CircleHelp, name: "FAQ", description: "How NNACT Pro works, in plain language." },
        ]}
      />
    </ConsolePage>
  );
}
