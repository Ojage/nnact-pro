"use client";

import Link from "next/link";
import { useState } from "react";

type StationKey = "dispatch" | "customer" | "invoice" | "inventory" | "membership" | "sponsor";
type TradeKey = "hvac" | "plumbing" | "electrical" | "cleaning";
type GoalKey = "dispatch" | "plans" | "sponsors" | "integrations";

const stations: Record<StationKey, { eyebrow: string; title: string; copy: string; bullets: string[] }> = {
  dispatch: {
    eyebrow: "Command 01",
    title: "Dispatch starts from the route board.",
    copy: "See today's jobs, active technicians, stale work, and cashflow pressure from one calm operations surface.",
    bullets: ["Live route and appointment context", "Job status by operational stage", "Technician handoff without office guesswork"],
  },
  customer: {
    eyebrow: "Command 02",
    title: "Customer history stays attached to the work.",
    copy: "Properties, equipment, notes, estimates, invoices, and follow-ups live around the customer record instead of scattered tabs.",
    bullets: ["Property and equipment memory", "Service history by customer", "Fast jump from job to account"],
  },
  invoice: {
    eyebrow: "Command 03",
    title: "Job-to-cash is one connected flow.",
    copy: "Estimate, approve, invoice, collect, review, and follow up without turning the last ten minutes into office cleanup.",
    bullets: ["Estimate-to-job conversion", "Invoice and offline payment tracking", "Review and follow-up loop"],
  },
  inventory: {
    eyebrow: "Command 04",
    title: "Parts and trucks stay visible.",
    copy: "Parts usage, reorder needs, and job materials belong beside real field work so missing inventory does not become a lost afternoon.",
    bullets: ["Price book and line items", "Truck-stock friendly workflows", "Vendor-ready expansion path"],
  },
  membership: {
    eyebrow: "Command 05",
    title: "Service plans are clear, not gimmicky.",
    copy: "Memberships track plan status, included visits, renewal timing, and priority benefits. No confusing points system required.",
    bullets: ["Included visits and reminders", "Priority scheduling notes", "Renewal and retention cues"],
  },
  sponsor: {
    eyebrow: "Command 06",
    title: "Sponsor space stays honest.",
    copy: "A clearly labeled local sponsor slot can fund free self-hosting without ad networks, tracking scripts, or creepy targeting.",
    bullets: ["Static local sponsor surface", "Pro removes sponsor placement", "No telemetry-based ad model"],
  },
};

const scenes = [
  ["Start the day", "Dispatch reads the job board, tech locations, route pressure, and open revenue before the first call lands.", "18", "jobs staged", "4", "techs active", "$12.4k", "ready to invoice"],
  ["Win the work", "Estimate options, approval state, customer context, and follow-up timing keep the sales path visible.", "7", "open estimates", "3", "need follow-up", "68%", "approval rate"],
  ["Finish the ticket", "Mobile notes, photos, parts, payment state, and customer signature stay attached to the job record.", "11", "field notes", "6", "parts used", "2", "return visits"],
  ["Close the loop", "Invoices, payments, reviews, reminders, and service-plan prompts connect the completed job to the next visit.", "9", "paid invoices", "5", "reviews queued", "14", "reminders set"],
] as const;

const configs: Record<TradeKey, { title: string; pack: string; goals: Record<GoalKey, string> }> = {
  hvac: {
    title: "HVAC command setup",
    pack: "Maintenance visits, equipment history, filters, capacitors, estimates, seasonal reminders, and invoice closeout.",
    goals: {
      dispatch: "Prioritize technician routes, emergency calls, stale jobs, and same-day completion pressure.",
      plans: "Use service plans for seasonal tune-ups, included visits, priority windows, and renewal prompts.",
      sponsors: "Pitch supply houses, filter vendors, equipment distributors, and financing partners for a labeled sponsor slot.",
      integrations: "Connect accounting, reminders, card payments, reviews, and later warranty or equipment workflows.",
    },
  },
  plumbing: {
    title: "Plumbing command setup",
    pack: "Emergency calls, water-heater jobs, drain work, fixture templates, property notes, and return-visit tracking.",
    goals: {
      dispatch: "Route urgent calls, return visits, inspections, and multi-tech work without losing the invoice thread.",
      plans: "Use service plans for water-heater checks, annual inspections, priority booking, and recurring reminders.",
      sponsors: "Offer sponsor placement to supply houses, water-treatment partners, tool vendors, and financing providers.",
      integrations: "Connect call intake, accounting, reminders, payment flows, and purchase-order style workflows.",
    },
  },
  electrical: {
    title: "Electrical command setup",
    pack: "Panel work, safety checks, generator service, lighting jobs, estimate options, and permit-friendly documentation.",
    goals: {
      dispatch: "Coordinate inspections, service calls, panel upgrades, and multi-stage jobs on one operational board.",
      plans: "Use service plans for safety checks, surge protection reminders, generator maintenance, and priority windows.",
      sponsors: "Pitch distributors, generator dealers, lighting vendors, tool suppliers, and financing partners.",
      integrations: "Connect estimates, review requests, accounting, customer messages, and inspection documentation.",
    },
  },
  cleaning: {
    title: "Cleaning command setup",
    pack: "Recurring visits, crew assignments, property notes, checklist flows, referral prompts, and customer follow-up.",
    goals: {
      dispatch: "Plan recurring routes, teams, property notes, add-ons, and repeat visit history without spreadsheet churn.",
      plans: "Use service plans for recurring visits, priority booking, add-on reminders, and renewal cues.",
      sponsors: "Offer sponsor placement to supply vendors, equipment providers, local partners, and facility-service buyers.",
      integrations: "Connect booking, payments, reminders, reviews, and recurring schedule automation.",
    },
  },
};

const techs = [
  { name: "Tech Rowan", status: "Finishing invoice", area: "North route", tone: "bg-accent" },
  { name: "Tech Mira", status: "En route", area: "Central route", tone: "bg-blue" },
  { name: "Tech Lane", status: "Needs parts", area: "South route", tone: "bg-yellow" },
];

function BrandMark({ className = "" }: { className?: string }) {
  return <span className={`ofp-brand-mark ${className}`}>OF</span>;
}

function CommandPreview() {
  return (
    <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-surface-50/90 p-5 shadow-2xl">
      <div className="absolute inset-0 ofp-grid-surface opacity-40" />
      <div className="relative flex items-center justify-between border-b border-white/10 pb-4">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-blue">Live command</p>
          <h2 className="mt-1 text-xl font-black text-fg">Today&apos;s field board</h2>
        </div>
        <span className="rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-bold text-accent">Online</span>
      </div>

      <div className="relative mt-5 grid gap-4 lg:grid-cols-[1.05fr_.95fr]">
        <div className="rounded-3xl border border-border bg-surface-200/85 p-4">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-sm font-bold text-fg">Route pressure</span>
            <span className="text-xs text-fg-dim">8:42 AM</span>
          </div>
          <svg viewBox="0 0 420 250" className="h-64 w-full rounded-2xl border border-border bg-surface-100">
            <defs>
              <linearGradient id="routeGlow" x1="0" x2="1" y1="0" y2="1">
                <stop offset="0%" stopColor="#22c55e" />
                <stop offset="100%" stopColor="#06b6d4" />
              </linearGradient>
            </defs>
            <path d="M45 195 C110 92 150 210 205 128 S300 62 374 96" fill="none" stroke="url(#routeGlow)" strokeWidth="8" strokeLinecap="round" />
            <path d="M45 195 C110 92 150 210 205 128 S300 62 374 96" fill="none" stroke="rgba(255,255,255,.28)" strokeWidth="1" strokeDasharray="8 10" strokeLinecap="round" />
            {[[45,195,"A"],[132,122,"B"],[205,128,"C"],[292,72,"D"],[374,96,"E"]].map(([x,y,label]) => (
              <g key={label as string}>
                <circle cx={x as number} cy={y as number} r="17" fill="#101820" stroke="#22c55e" strokeWidth="3" />
                <text x={x as number} y={(y as number) + 5} textAnchor="middle" fontSize="13" fontWeight="900" fill="#f5f7f2">{label}</text>
              </g>
            ))}
          </svg>
        </div>

        <div className="grid gap-3">
          {techs.map((tech) => (
            <div key={tech.name} className="rounded-2xl border border-border bg-surface-200/85 p-4">
              <div className="flex items-center gap-3">
                <span className={`h-3 w-3 rounded-full ${tech.tone}`} />
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-fg">{tech.name}</p>
                  <p className="text-xs text-fg-muted">{tech.area}</p>
                </div>
                <span className="rounded-full bg-surface-400 px-2.5 py-1 text-[11px] font-bold text-fg-muted">{tech.status}</span>
              </div>
            </div>
          ))}
          <div className="rounded-2xl border border-accent/30 bg-accent/10 p-4">
            <p className="text-xs uppercase tracking-[0.22em] text-accent">Cashflow</p>
            <p className="mt-1 text-3xl font-black tracking-tight text-fg">$12.4k</p>
            <p className="text-sm text-fg-muted">ready to invoice from completed work</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function WelcomePage() {
  const [stationKey, setStationKey] = useState<StationKey>("dispatch");
  const [sceneIndex, setSceneIndex] = useState(0);
  const [trade, setTrade] = useState<TradeKey>("hvac");
  const [goal, setGoal] = useState<GoalKey>("dispatch");
  const station = stations[stationKey];
  const scene = scenes[sceneIndex];
  const config = configs[trade];

  return (
    <main className="min-h-screen bg-surface-100 text-fg">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-surface-100/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-[min(1180px,calc(100%-32px))] items-center gap-5">
          <Link href="/welcome" className="flex items-center gap-3 text-fg no-underline hover:no-underline" aria-label="OpenFieldPro home">
            <BrandMark className="h-9 w-9 text-xs" />
            <span className="font-black tracking-tight">OpenFieldPro</span>
          </Link>
          <nav className="ml-auto hidden items-center gap-6 text-sm font-semibold text-fg-muted md:flex">
            <a href="#command-map">Command map</a>
            <a href="#showreel">Showreel</a>
            <a href="#service-plans">Service plans</a>
            <a href="#sponsors">Sponsors</a>
            <a href="#configure">Configure</a>
          </nav>
          <Link href="/login" className="rounded-full bg-accent px-4 py-2 text-sm font-black text-surface-100 no-underline hover:bg-accent-hover hover:no-underline">
            Sign in
          </Link>
        </div>
      </header>

      <section className="ofp-command-gradient overflow-hidden border-b border-white/10">
        <div className="mx-auto grid w-[min(1180px,calc(100%-32px))] gap-10 py-16 lg:grid-cols-[.88fr_1.12fr] lg:items-center lg:py-20">
          <div>
            <p className="mb-5 inline-flex rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-black uppercase tracking-[0.22em] text-accent">
              Open-source field command center
            </p>
            <h1 className="max-w-3xl text-6xl font-black leading-[.86] tracking-[-0.08em] text-fg md:text-8xl">
              Own your field operations.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-fg-muted md:text-xl">
              OpenFieldPro is a self-hostable field service platform for dispatch, CRM, jobs, estimates, invoices, payments, technicians, service plans, and practical reporting — without telemetry, phone-home licensing, or artificial core limits.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="https://github.com/niko4244/openfieldpro" target="_blank" rel="noopener noreferrer" className="rounded-full bg-accent px-5 py-3 text-sm font-black text-surface-100 no-underline hover:bg-accent-hover hover:no-underline">
                View repository
              </a>
              <Link href="/login" className="rounded-full border border-white/15 bg-white/5 px-5 py-3 text-sm font-bold text-fg no-underline hover:bg-white/10 hover:no-underline">
                Open app demo
              </Link>
            </div>
            <div className="mt-10 grid max-w-2xl grid-cols-3 gap-3 text-sm">
              {["AGPL-3.0", "Self-hostable", "No telemetry"].map((item) => (
                <div key={item} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-fg-muted">
                  <strong className="block text-base text-fg">{item}</strong>
                  <span>Built for ownership</span>
                </div>
              ))}
            </div>
          </div>
          <CommandPreview />
        </div>
      </section>

      <section id="command-map" className="border-b border-border py-20">
        <div className="mx-auto w-[min(1180px,calc(100%-32px))]">
          <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <h2 className="max-w-3xl text-4xl font-black leading-[.95] tracking-[-0.055em] md:text-6xl">A command map for the whole service business.</h2>
            <p className="max-w-md text-fg-muted">The brand kit turns each product area into an operational station: route board, customer memory, job-to-cash, inventory, service plans, and sponsor space.</p>
          </div>
          <div className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
            <div className="relative min-h-[420px] overflow-hidden rounded-[2rem] border border-border bg-surface-50 p-5 ofp-grid-surface">
              {Object.keys(stations).map((key, index) => {
                const positions = ["left-[12%] top-[18%]", "left-[44%] top-[12%]", "left-[72%] top-[30%]", "left-[22%] top-[62%]", "left-[52%] top-[68%]", "left-[80%] top-[70%]"];
                return (
                  <button
                    key={key}
                    onClick={() => setStationKey(key as StationKey)}
                    aria-pressed={stationKey === key}
                    className={`absolute ${positions[index]} grid h-16 w-16 place-items-center rounded-2xl border text-lg font-black transition hover:scale-105 ${stationKey === key ? "border-accent bg-accent text-surface-100" : "border-white/15 bg-surface-300 text-fg-muted"}`}
                  >
                    {index + 1}
                  </button>
                );
              })}
              <div className="absolute bottom-6 left-6 right-6 rounded-3xl border border-white/10 bg-surface-100/80 p-5 backdrop-blur">
                <p className="text-xs uppercase tracking-[0.28em] text-blue">OpenFieldPro map</p>
                <p className="mt-2 text-2xl font-black">Route board → customer → job → invoice → follow-up</p>
              </div>
            </div>
            <aside className="rounded-[2rem] border border-border bg-surface-300 p-7">
              <span className="rounded-full bg-yellow/15 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-yellow">{station.eyebrow}</span>
              <h3 className="mt-5 text-4xl font-black leading-none tracking-[-0.05em]">{station.title}</h3>
              <p className="mt-4 text-fg-muted">{station.copy}</p>
              <div className="mt-6 grid gap-3">
                {station.bullets.map((bullet) => (
                  <div key={bullet} className="rounded-2xl border border-border bg-surface-200 p-4 text-sm font-semibold text-fg-muted">
                    <span className="mr-2 text-accent">✓</span>{bullet}
                  </div>
                ))}
              </div>
            </aside>
          </div>
        </div>
      </section>

      <section id="showreel" className="border-b border-border bg-surface-50 py-20">
        <div className="mx-auto w-[min(1180px,calc(100%-32px))]">
          <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <h2 className="max-w-3xl text-4xl font-black leading-[.95] tracking-[-0.055em] md:text-6xl">The product should feel alive in screenshots.</h2>
            <p className="max-w-md text-fg-muted">The landing page now sells through operational moments instead of generic feature tiles.</p>
          </div>
          <div className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
            <div className="grid gap-3">
              {scenes.map((item, index) => (
                <button key={item[0]} onClick={() => setSceneIndex(index)} aria-pressed={sceneIndex === index} className={`rounded-3xl border p-5 text-left transition ${sceneIndex === index ? "border-accent bg-accent text-surface-100" : "border-border bg-surface-300 text-fg-muted hover:bg-surface-400"}`}>
                  <strong className="block text-lg text-inherit">{item[0]}</strong>
                  <span className="text-sm opacity-80">{item[1]}</span>
                </button>
              ))}
            </div>
            <div className="rounded-[2rem] border border-border bg-surface-100 p-7 ofp-grid-surface">
              <p className="text-xs uppercase tracking-[0.28em] text-blue">Showreel scene</p>
              <h3 className="mt-3 text-5xl font-black leading-none tracking-[-0.06em]">{scene[0]}</h3>
              <p className="mt-4 max-w-2xl text-lg text-fg-muted">{scene[1]}</p>
              <div className="mt-8 grid gap-4 md:grid-cols-3">
                {[[scene[2], scene[3]], [scene[4], scene[5]], [scene[6], scene[7]]].map(([value, label]) => (
                  <div key={label} className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
                    <strong className="block text-4xl font-black text-fg">{value}</strong>
                    <span className="text-sm text-fg-muted">{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="service-plans" className="border-b border-border py-20">
        <div className="mx-auto grid w-[min(1180px,calc(100%-32px))] gap-5 lg:grid-cols-2">
          <div>
            <p className="mb-4 text-xs font-black uppercase tracking-[0.28em] text-accent">Service plan system</p>
            <h2 className="text-4xl font-black leading-[.95] tracking-[-0.055em] md:text-6xl">Memberships without confusing points.</h2>
            <p className="mt-5 text-lg text-fg-muted">The old points-style section has been replaced with practical service-plan tracking: visits, benefits, renewal timing, and priority scheduling.</p>
          </div>
          <div className="rounded-[2rem] border border-border bg-surface-300 p-6">
            <h3 className="text-2xl font-black">Service Club</h3>
            <p className="mt-2 text-fg-muted">A customer-facing plan view for recurring maintenance and retention.</p>
            <div className="mt-6 grid gap-3">
              {["Spring tune-up completed", "Fall tune-up scheduled", "Priority window: active", "Renewal reminder: 30 days before term end"].map((item) => (
                <div key={item} className="flex items-center justify-between rounded-2xl border border-border bg-surface-200 p-4">
                  <span className="font-semibold text-fg-muted">{item}</span>
                  <span className="rounded-full bg-accent/15 px-3 py-1 text-xs font-black text-accent">tracked</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="sponsors" className="border-b border-border bg-surface-50 py-20">
        <div className="mx-auto grid w-[min(1180px,calc(100%-32px))] gap-5 lg:grid-cols-[1fr_.9fr]">
          <div>
            <p className="mb-4 text-xs font-black uppercase tracking-[0.28em] text-yellow">Sponsor model</p>
            <h2 className="text-4xl font-black leading-[.95] tracking-[-0.055em] md:text-6xl">Useful local sponsor space. No creepy ad network.</h2>
            <p className="mt-5 max-w-2xl text-lg text-fg-muted">The free product can include one clearly labeled, locally controlled sponsor placement. Pro removes it. The sponsor model should be honest, static, and useful to service businesses.</p>
          </div>
          <div className="grid gap-3">
            {["Sponsored by Metro Supply — same-day parts pickup", "Sponsored by FleetFuel — fuel cards for service vans", "Sponsored by HomeTrade Finance — repair financing options"].map((item) => (
              <div key={item} className="rounded-3xl border border-dashed border-yellow/40 bg-yellow/10 p-5 text-sm font-semibold text-fg-muted">{item}</div>
            ))}
          </div>
        </div>
      </section>

      <section id="configure" className="py-20">
        <div className="mx-auto w-[min(1180px,calc(100%-32px))]">
          <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <h2 className="max-w-3xl text-4xl font-black leading-[.95] tracking-[-0.055em] md:text-6xl">Configure the pitch by trade.</h2>
            <p className="max-w-md text-fg-muted">The brand system can bend toward each service business without changing the core product story.</p>
          </div>
          <div className="grid gap-5 lg:grid-cols-[.9fr_1.1fr]">
            <div className="grid gap-5 rounded-[2rem] border border-border bg-surface-300 p-6">
              <div>
                <p className="mb-3 text-xs font-black uppercase tracking-[0.22em] text-fg-dim">Trade</p>
                <div className="flex flex-wrap gap-2">
                  {Object.keys(configs).map((item) => (
                    <button key={item} onClick={() => setTrade(item as TradeKey)} className={`rounded-full px-4 py-2 text-sm font-bold capitalize ${trade === item ? "bg-accent text-surface-100" : "bg-surface-200 text-fg-muted"}`}>{item}</button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-3 text-xs font-black uppercase tracking-[0.22em] text-fg-dim">Goal</p>
                <div className="flex flex-wrap gap-2">
                  {Object.keys(config.goals).map((item) => (
                    <button key={item} onClick={() => setGoal(item as GoalKey)} className={`rounded-full px-4 py-2 text-sm font-bold capitalize ${goal === item ? "bg-blue text-surface-100" : "bg-surface-200 text-fg-muted"}`}>{item}</button>
                  ))}
                </div>
              </div>
            </div>
            <div className="rounded-[2rem] border border-border bg-surface-50 p-7 ofp-grid-surface">
              <p className="text-xs uppercase tracking-[0.28em] text-blue">Recommended setup</p>
              <h3 className="mt-3 text-5xl font-black leading-none tracking-[-0.06em]">{config.title}</h3>
              <p className="mt-4 text-lg text-fg-muted">{config.goals[goal]}</p>
              <div className="mt-6 rounded-3xl border border-border bg-surface-200 p-5">
                <p className="text-xs font-black uppercase tracking-[0.22em] text-accent">Starter pack</p>
                <p className="mt-2 text-fg-muted">{config.pack}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-border bg-[#f7f3ea] py-20 text-[#111827]">
        <div className="mx-auto w-[min(1180px,calc(100%-32px))] text-center">
          <h2 className="mx-auto max-w-4xl text-5xl font-black leading-[.9] tracking-[-0.07em] md:text-7xl">Stop renting the workflow that runs your service business.</h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-[#526257]">OpenFieldPro should look and feel like ownership: practical, field-ready, self-hostable, and serious enough for real operators.</p>
          <div className="mt-8 flex justify-center gap-3">
            <a href="https://github.com/niko4244/openfieldpro" target="_blank" rel="noopener noreferrer" className="rounded-full bg-[#22c55e] px-5 py-3 text-sm font-black text-[#101820] no-underline hover:no-underline">View repository</a>
            <Link href="/login" className="rounded-full border border-[#111827]/20 px-5 py-3 text-sm font-black text-[#111827] no-underline hover:no-underline">Sign in</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
