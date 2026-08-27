import type { Metadata } from "next";
import Link from "next/link";
import { NNACT_COMPANY, NNACT_PRODUCT } from "@nnact/shared";
import { BrandMark } from "@/components/brand-mark";
import { pageMetadata } from "@/lib/site-metadata";

export const metadata: Metadata = pageMetadata({
  title: "Welcome",
  description: NNACT_PRODUCT.description,
  path: "/welcome",
});

const divisions = NNACT_COMPANY.divisions.map((division) => ({
  title: division.name,
  services: division.services,
}));

const operations = [
  ["Dispatch and field command", "Schedule technicians, assign jobs, track status, and coordinate return visits across HVAC, refrigeration, electrical, and maintenance work."],
  ["CRM and asset history", "Customers, properties, equipment, cold rooms, generators, solar systems, photos, and complete service history in one record."],
  ["Estimate to payment", "Itemized BOQs, estimates, approvals, invoices, offline payments, and transparent pricing for residential and commercial clients."],
  ["Preventive maintenance", "Service plans, reminders, and contract workflows — because equipment should be maintained before it fails."],
  ["Repair Brain", "Institutional knowledge from every visit: symptoms, faults, measurements, procedures, and verified repair outcomes your team can reuse."],
  ["Business control", "Reporting, margins, organization branding, integrations, backups, and self-hosted deployment you own."],
];

const fieldFlow = [
  "Open the work order and confirm the equipment or system",
  "Link the asset to model knowledge — AC, fridge, inverter, cold room, or motor",
  "Start from the complaint, error code, or measured symptom",
  "Run exact checks with meter points and operating conditions",
  "Record readings before the workflow branches",
  "Apply verified repair procedures and capture parts used",
  "Close with outcome, evidence, and a knowledge proposal for the next technician",
];

export default function WelcomePage() {
  return (
    <main className="min-h-screen bg-surface-100 text-fg">
      <header className="sticky top-0 z-50 border-b border-border bg-surface-100/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-[min(1180px,calc(100%-32px))] items-center gap-5">
          <BrandMark href="/welcome" size="lg" />
          <nav className="ml-auto hidden items-center gap-6 text-sm font-semibold text-fg-muted md:flex">
            <a href="#divisions">Services</a>
            <a href="#operations">Platform</a>
            <a href="#repair-brain">Repair Brain</a>
            <a href="#deploy">Deploy</a>
          </nav>
          <Link href="/login" className="rounded-full bg-accent px-4 py-2 text-sm font-black text-white no-underline hover:bg-accent-hover">
            Open workspace
          </Link>
        </div>
      </header>

      <section className="overflow-hidden border-b border-border bg-gradient-to-br from-surface-100 via-surface-50 to-surface-100">
        <div className="mx-auto grid w-[min(1180px,calc(100%-32px))] gap-12 py-20 lg:grid-cols-[.95fr_1.05fr] lg:items-center lg:py-28">
          <div>
            <p className="mb-5 inline-flex rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-accent">
              {NNACT_COMPANY.tagline}
            </p>
            <h1 className="max-w-4xl text-5xl font-black leading-[.92] tracking-[-0.075em] text-fg md:text-7xl">
              Technical operations for HVAC, energy, and maintenance teams.
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-fg-muted md:text-xl">
              {NNACT_PRODUCT.name} is {NNACT_COMPANY.shortName}&apos;s operations platform — dispatch, CRM, estimates, preventive maintenance, and{" "}
              <strong className="font-bold text-fg">Repair Brain</strong> institutional knowledge for field work across Buea and Southwest Cameroon.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/login" className="rounded-full bg-accent px-5 py-3 text-sm font-black text-white no-underline hover:bg-accent-hover">
                Open the workspace
              </Link>
              <a
                href={NNACT_COMPANY.contact.website}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border border-border bg-surface-50 px-5 py-3 text-sm font-bold text-fg no-underline hover:bg-surface-200"
              >
                Visit NNACT services
              </a>
            </div>
            <div className="mt-10 grid max-w-2xl grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              {["HVAC & refrigeration", "Electrical & solar", "Preventive maintenance", "Repair Brain"].map((item) => (
                <div key={item} className="rounded-2xl border border-border bg-surface-50 p-3 text-center font-semibold text-fg-muted">
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[2rem] border border-border bg-surface-50 p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[.18em] text-accent">Today&apos;s field command</p>
                <p className="mt-1 text-xl font-black text-fg">Next visit and repair state</p>
              </div>
              <span className="rounded-full bg-green/10 px-3 py-1 text-xs font-bold text-green">Synced</span>
            </div>
            <div className="mt-5 grid gap-4">
              <div className="rounded-2xl border border-border bg-surface-200 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-fg-dim">9:30 AM · Split AC · 2.5 HP</p>
                    <p className="mt-2 text-lg font-black text-fg">Not cooling — suspected refrigerant leak</p>
                    <p className="mt-1 text-sm text-fg-muted">Model linked · Repair Brain fault suggestions loaded</p>
                  </div>
                  <span className="rounded-full bg-blue/10 px-3 py-1 text-xs font-bold text-blue">Diagnosing</span>
                </div>
                <div className="mt-5 rounded-xl border border-accent/30 bg-accent/5 p-4">
                  <p className="text-xs font-black uppercase tracking-wide text-accent">Active check</p>
                  <p className="mt-2 font-bold text-fg">Verify suction and discharge pressures under cooling load</p>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-lg bg-surface-100 p-3"><span className="text-fg-dim">Expected</span><p className="mt-1 font-semibold text-fg">65–75 PSI suction</p></div>
                    <div className="rounded-lg bg-surface-100 p-3"><span className="text-fg-dim">Recorded</span><p className="mt-1 font-semibold text-fg">42 PSI — low</p></div>
                    <div className="rounded-lg bg-surface-100 p-3"><span className="text-fg-dim">Procedure</span><p className="mt-1 font-semibold text-fg">Leak detection → recharge</p></div>
                    <div className="rounded-lg bg-surface-100 p-3"><span className="text-fg-dim">Knowledge</span><p className="mt-1 font-semibold text-fg">3 prior successes</p></div>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[["6", "visits today"], ["4", "active jobs"], ["2", "maintenance plans"]].map(([value, label]) => (
                  <div key={label} className="rounded-2xl border border-border bg-surface-200 p-4 text-center">
                    <p className="text-2xl font-black text-fg">{value}</p>
                    <p className="mt-1 text-xs text-fg-muted">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="divisions" className="border-b border-border py-20">
        <div className="mx-auto w-[min(1180px,calc(100%-32px))]">
          <div className="max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[.2em] text-blue">NNACT technical divisions</p>
            <h2 className="mt-3 text-4xl font-black tracking-tight text-fg md:text-6xl">One company. Three engineering pillars.</h2>
            <p className="mt-5 text-lg leading-8 text-fg-muted">
              {NNACT_COMPANY.customerPromise} {NNACT_PRODUCT.name} supports every division with shared customer records, equipment history, and field intelligence.
            </p>
          </div>
          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            {divisions.map((division) => (
              <article key={division.title} className="rounded-3xl border border-border bg-surface-50 p-6">
                <p className="text-xl font-black text-fg">{division.title}</p>
                <ul className="mt-4 space-y-2 text-sm leading-6 text-fg-muted">
                  {division.services.map((service) => (
                    <li key={service} className="flex gap-2">
                      <span className="text-accent">·</span>
                      <span>{service}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="operations" className="border-b border-border bg-surface-50 py-20">
        <div className="mx-auto w-[min(1180px,calc(100%-32px))]">
          <div className="max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[.2em] text-blue">Operations platform</p>
            <h2 className="mt-3 text-4xl font-black tracking-tight text-fg md:text-6xl">Run the business. Execute in the field.</h2>
            <p className="mt-5 text-lg leading-8 text-fg-muted">
              From emergency AC repairs to cold-room installations and solar commissioning — {NNACT_PRODUCT.name} keeps dispatch, billing, and technical evidence in one system.
            </p>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {operations.map(([title, description]) => (
              <article key={title} className="rounded-3xl border border-border bg-surface-100 p-6">
                <p className="text-lg font-black text-fg">{title}</p>
                <p className="mt-3 text-sm leading-6 text-fg-muted">{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="repair-brain" className="border-b border-border py-20">
        <div className="mx-auto grid w-[min(1180px,calc(100%-32px))] gap-12 lg:grid-cols-[.8fr_1.2fr]">
          <div>
            <p className="text-xs font-black uppercase tracking-[.2em] text-accent">Repair Brain</p>
            <h2 className="mt-3 text-4xl font-black tracking-tight text-fg md:text-6xl">Every repair makes the next one faster.</h2>
            <p className="mt-5 text-lg leading-8 text-fg-muted">
              Institutional knowledge accumulates from real field work — symptoms, faults, measurements, procedures, and outcomes — so technicians start from verified experience, not guesswork.
            </p>
          </div>
          <div className="grid gap-3">
            {fieldFlow.map((step, index) => (
              <div key={step} className="flex items-center gap-4 rounded-2xl border border-border bg-surface-50 p-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 font-black text-accent">{index + 1}</span>
                <p className="font-semibold text-fg">{step}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-surface-50 py-20">
        <div className="mx-auto grid w-[min(1180px,calc(100%-32px))] gap-6 lg:grid-cols-3">
          {[
            ["Dreams, honesty, integrity", "The values that guide NNACT field work — transparent pricing, skilled professionals, and customer-centered service."],
            ["Preventive-first mindset", "Maintenance contracts for banks, hotels, restaurants, cold-storage, and industrial clients reduce downtime and operating cost."],
            ["Local expertise, professional standards", `Based in ${NNACT_COMPANY.location.addressLocality}, ${NNACT_COMPANY.location.addressRegion} — serving businesses and households across Southwest Cameroon.`],
          ].map(([title, copy]) => (
            <article key={title} className="rounded-3xl border border-border bg-surface-100 p-6">
              <p className="text-xl font-black text-fg">{title}</p>
              <p className="mt-3 text-sm leading-6 text-fg-muted">{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="deploy" className="py-20">
        <div className="mx-auto flex w-[min(1180px,calc(100%-32px))] flex-col items-start justify-between gap-8 rounded-[2rem] border border-accent/25 bg-accent/5 p-8 lg:flex-row lg:items-center lg:p-12">
          <div className="max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[.2em] text-accent">Own your operations data</p>
            <h2 className="mt-3 text-4xl font-black tracking-tight text-fg">Self-hosted. No telemetry required.</h2>
            <p className="mt-4 text-lg leading-8 text-fg-muted">
              PostgreSQL, Fastify, Next.js, Expo, Redis, and container deployment — {NNACT_PRODUCT.name} stays under your control while your team runs HVAC, refrigeration, electrical, and maintenance operations in the field.
            </p>
          </div>
          <Link href="/login" className="shrink-0 rounded-full bg-accent px-6 py-3 text-sm font-black text-white no-underline hover:bg-accent-hover">
            Open workspace
          </Link>
        </div>
      </section>

      <footer className="border-t border-border py-8">
        <div className="mx-auto flex w-[min(1180px,calc(100%-32px))] flex-wrap items-center justify-between gap-3 text-sm text-fg-dim">
          <span>{NNACT_COMPANY.legalName}</span>
          <span>
            {NNACT_COMPANY.location.streetAddress}, {NNACT_COMPANY.location.addressLocality} · {NNACT_COMPANY.contact.email}
          </span>
        </div>
      </footer>
    </main>
  );
}
