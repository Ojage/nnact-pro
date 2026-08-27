import Link from "next/link";
import { NNACT_COMPANY } from "@nnact/shared";
import { CustomerFooter, CustomerHeader } from "@/components/customer-chrome";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-surface-100 text-fg">
      <CustomerHeader />

      <main>
        <section className="overflow-hidden border-b border-border bg-gradient-to-br from-surface-100 via-surface-50 to-surface-100">
          <div className="mx-auto grid w-[min(1080px,calc(100%-32px))] gap-10 py-16 lg:grid-cols-[1fr_.9fr] lg:items-center lg:py-24">
            <div>
              <p className="mb-4 inline-flex rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-accent">
                {NNACT_COMPANY.motto}
              </p>
              <h1 className="max-w-2xl text-4xl font-black leading-[.95] tracking-[-0.04em] text-fg md:text-6xl">
                HVAC, refrigeration, electrical &amp; maintenance — on your schedule.
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-fg-muted">
                {NNACT_COMPANY.customerPromise} Request a visit, approve estimates, pay invoices, and track service history from one secure customer portal.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/book" className="rounded-full bg-accent px-5 py-3 text-sm font-black text-white no-underline hover:bg-accent-hover">
                  Request service
                </Link>
                <a
                  href={`tel:${NNACT_COMPANY.contact.phones[0].replace(/\s/g, "")}`}
                  className="rounded-full border border-border bg-surface-50 px-5 py-3 text-sm font-bold text-fg no-underline hover:bg-surface-200"
                >
                  Emergency call
                </a>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {NNACT_COMPANY.divisions.map((division) => (
                <article key={division.name} className="rounded-2xl border border-border bg-surface-50 p-5 shadow-sm">
                  <p className="text-sm font-black text-fg">{division.name}</p>
                  <ul className="mt-3 space-y-1 text-xs leading-5 text-fg-muted">
                    {division.services.slice(0, 3).map((service) => (
                      <li key={service}>· {service}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16">
          <div className="mx-auto w-[min(1080px,calc(100%-32px))]">
            <h2 className="text-3xl font-black tracking-tight">How it works</h2>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {[
                ["Request service", "Tell us what you need — AC repair, cold room, solar, appliance, or preventive maintenance."],
                ["Receive your secure link", "We email a private portal link to review estimates, pay invoices, and see your service history."],
                ["We maintain before it fails", "Schedule recurring maintenance and keep equipment running reliably."],
              ].map(([title, copy]) => (
                <article key={title} className="rounded-2xl border border-border bg-surface-50 p-6">
                  <p className="text-lg font-black text-fg">{title}</p>
                  <p className="mt-3 text-sm leading-6 text-fg-muted">{copy}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>

      <CustomerFooter />
    </div>
  );
}
