import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import type { ComponentType, SVGProps } from "react";
import {
  AirVent,
  ArrowDown,
  ArrowUpRight,
  CalendarCheck,
  Car,
  ClipboardCheck,
  Factory,
  Home,
  Mail,
  MapPin,
  Phone,
  Power,
  Refrigerator,
  ShieldCheck,
  Sun,
  Wrench,
  Zap,
} from "@/components/landing-icons";
import { buildWhatsAppUrl, NNACT_COMPANY } from "@nnact/shared";
import { welcomeFaq, welcomeServices, welcomeSteps } from "@/app/content";
import { BookVisitButton } from "@/components/booking-dialog";
import { LandingHeader } from "@/components/landing-header";
import { OpenStatus } from "@/components/open-status";
import { MobileBar } from "@/components/mobile-bar";
import { Reveal } from "@/components/reveal";
import { customerSiteMetadata } from "@/lib/site-metadata";

type LandingIcon = ComponentType<SVGProps<SVGSVGElement>>;

const serviceIcons: Record<string, LandingIcon> = {
  AirVent,
  Refrigerator,
  Car,
  Zap,
  Power,
  Sun,
  Home,
  CalendarCheck,
  Factory,
};

const workCards: Array<{ icon: LandingIcon; title: string; copy: string }> = [
  {
    icon: Wrench,
    title: "Diagnose the real fault",
    copy: "Our technicians work from symptoms, measurements, and equipment history — not guesswork.",
  },
  {
    icon: ClipboardCheck,
    title: "Repair with evidence",
    copy: "Parts, checks, and outcomes are captured so the next visit starts with verified context.",
  },
  {
    icon: ShieldCheck,
    title: "Prevent the next failure",
    copy: "Maintenance plans keep HVAC, refrigeration, electrical, and power systems running longer.",
  },
];

export const metadata: Metadata = {
  ...customerSiteMetadata,
  title: "NNACT — HVAC, Refrigeration, Electrical & Maintenance in Buea",
  description:
    "Book a visit for air conditioning, refrigeration, electrical, solar, appliances, and preventive maintenance in Buea and Southwest Cameroon.",
};

export default function HomePage() {
  return (
    <div className="landing-page min-h-screen overflow-x-hidden bg-[#fbfaf8] text-[#141414] dark:bg-[#0a0a0a] dark:text-white">
      <LandingHeader />

      <main>
        <section id="top" className="relative flex min-h-[720px] items-center justify-center overflow-hidden bg-[#0d0d0d]">
          <Image
            src="/welcome-hero.png"
            alt="NNACT technician at work"
            fill
            priority
            sizes="100vw"
            className="object-cover object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/85 via-black/70 to-black/90" />
          <div className="relative z-10 mx-auto flex w-[min(1180px,calc(100%-32px))] flex-col items-center px-0 pb-28 pt-28 text-center sm:px-6">
            <p className="text-[11px] font-black uppercase tracking-[0.24em] text-[#ffd400]">
              NNACT · Buea, Southwest Cameroon
            </p>
            <h1 className="mt-6 max-w-5xl text-5xl font-black leading-[1.02] tracking-[-0.055em] text-white sm:text-6xl lg:text-[5.5rem]">
              Technical help that gets to the root of it.
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-white/80 sm:text-xl">
              Air conditioning, refrigeration, electrical, solar, appliances, and preventive maintenance — delivered by
              NNACT field teams across Buea and Southwest Cameroon.
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <BookVisitButton />
              <a
                href="#services"
                className="rounded-full border border-white/30 bg-white/10 px-6 py-3 text-sm font-bold text-white no-underline backdrop-blur-md transition hover:bg-white/20 active:scale-[0.98]"
              >
                See services ›
              </a>
            </div>
            <div className="mt-8">
              <OpenStatus />
            </div>
          </div>
          <a
            href="#divisions"
            aria-label="Scroll to services"
            className="absolute bottom-8 left-1/2 z-10 -translate-x-1/2 rounded-full border border-white/20 p-2 text-white/70 transition hover:text-white"
          >
            <ArrowDown className="size-5" aria-hidden="true" />
          </a>
        </section>

        <section id="divisions" className="border-b border-black/5 bg-white py-14 dark:border-white/10 dark:bg-[#111111]">
          <div className="mx-auto w-[min(1180px,calc(100%-32px))]">
            <p className="text-center text-[11px] font-black uppercase tracking-[0.22em] text-[#6b6b6b] dark:text-white/50">
              One company · three engineering divisions
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              {NNACT_COMPANY.divisions.map((division) => (
                <div
                  key={division.name}
                  className="rounded-2xl border border-black/5 bg-[#fbfaf8] px-5 py-6 text-center dark:border-white/10 dark:bg-white/5"
                >
                  <p className="text-sm font-black uppercase tracking-[0.12em] text-[#141414] dark:text-white">
                    {division.name}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-[#6b6b6b] dark:text-white/50">{division.services.join(" · ")}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="services" className="bg-[#fbfaf8] py-24 dark:bg-[#0a0a0a]">
          <div className="mx-auto w-[min(1180px,calc(100%-32px))]">
            <Reveal className="max-w-3xl">
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#8a6a00] dark:text-[#ffd400]">
                What we service
              </p>
              <h2 className="mt-4 text-4xl font-black leading-[1.05] tracking-[-0.045em] sm:text-5xl">
                Skilled help for the systems your day depends on.
              </h2>
              <p className="mt-5 text-lg leading-8 text-[#5f5f5f] dark:text-white/60">
                Every visit is handled by a trained NNACT technician and recorded with the equipment history, so your
                next service starts with context.
              </p>
            </Reveal>

            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {welcomeServices.map((service, index) => {
                const Icon = serviceIcons[service.icon] ?? Wrench;
                return (
                  <Reveal key={service.title} delay={index * 40}>
                    <article className="flex h-full flex-col rounded-[24px] border border-black/5 bg-white p-6 transition duration-300 hover:-translate-y-1 hover:border-[#ffd400] hover:shadow-lg dark:border-white/10 dark:bg-white/5">
                      <span className="flex size-11 items-center justify-center rounded-2xl bg-[#ffd400]/20 text-[#141414] dark:text-[#ffd400]">
                        <Icon className="size-5" aria-hidden="true" />
                      </span>
                      <h3 className="mt-5 text-lg font-black tracking-tight">{service.title}</h3>
                      <p className="mt-2 flex-1 text-sm leading-6 text-[#5f5f5f] dark:text-white/55">{service.description}</p>
                      <div className="mt-5">
                        <BookVisitButton service={service.title} variant="quiet" />
                      </div>
                    </article>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>

        <section id="how-it-works" className="bg-[#111111] py-24 text-white">
          <div className="mx-auto w-[min(1180px,calc(100%-32px))]">
            <Reveal className="max-w-3xl">
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#ffd400]">How it works</p>
              <h2 className="mt-4 text-4xl font-black leading-[1.05] tracking-[-0.045em] sm:text-5xl">
                From first message to verified outcome.
              </h2>
            </Reveal>

            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {welcomeSteps.map((step, index) => (
                <Reveal key={step.title} delay={index * 60}>
                  <article className="h-full rounded-[24px] border border-white/10 bg-white/5 p-6 transition-colors duration-300 hover:border-[#ffd400]/60 hover:bg-[#ffd400]/5">
                    <span className="flex size-10 items-center justify-center rounded-full bg-[#ffd400] text-sm font-black text-[#141414]">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <h3 className="mt-5 text-lg font-black">{step.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-white/60">{step.description}</p>
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section id="our-work" className="bg-white py-24 dark:bg-[#111111]">
          <div className="mx-auto grid w-[min(1180px,calc(100%-32px))] gap-12 lg:grid-cols-[.85fr_1.15fr] lg:items-center">
            <Reveal>
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#8a6a00] dark:text-[#ffd400]">
                Our work
              </p>
              <h2 className="mt-4 text-4xl font-black leading-[1.05] tracking-[-0.045em] sm:text-5xl">
                Field knowledge, not guesswork.
              </h2>
              <p className="mt-5 text-lg leading-8 text-[#5f5f5f] dark:text-white/60">
                {NNACT_COMPANY.motto} {NNACT_COMPANY.customerPromise} Every NNACT visit adds to the record, so your
                equipment gets better service over time.
              </p>
              <Link href="/account" className="mt-7 inline-flex items-center gap-2 text-sm font-black no-underline">
                My account <ArrowUpRight className="size-4" aria-hidden="true" />
              </Link>
            </Reveal>

            <div className="grid gap-3">
              {workCards.map((item, index) => {
                const Icon = item.icon;
                return (
                  <Reveal key={item.title} delay={index * 60}>
                    <article className="flex gap-4 rounded-[24px] border border-black/5 bg-[#fbfaf8] p-6 dark:border-white/10 dark:bg-white/5">
                      <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[#141414] text-[#ffd400] dark:bg-[#ffd400] dark:text-[#141414]">
                        <Icon className="size-5" aria-hidden="true" />
                      </span>
                      <div>
                        <h3 className="text-lg font-black">{item.title}</h3>
                        <p className="mt-1 text-sm leading-6 text-[#5f5f5f] dark:text-white/55">{item.copy}</p>
                      </div>
                    </article>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>

        <section id="faq" className="bg-[#fbfaf8] py-24 dark:bg-[#0a0a0a]">
          <div className="mx-auto grid w-[min(1180px,calc(100%-32px))] gap-12 lg:grid-cols-[.8fr_1.2fr]">
            <Reveal>
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#8a6a00] dark:text-[#ffd400]">FAQ</p>
              <h2 className="mt-4 text-4xl font-black leading-[1.05] tracking-[-0.045em] sm:text-5xl">Good questions.</h2>
            </Reveal>
            <div className="grid gap-3">
              {welcomeFaq.map((item, index) => (
                <Reveal key={item.question} delay={index * 40}>
                  <details className="group rounded-[20px] border border-black/5 bg-white p-5 dark:border-white/10 dark:bg-white/5">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-black [&::-webkit-details-marker]:hidden">
                      {item.question}
                      <span aria-hidden="true" className="text-xl leading-none transition-transform group-open:rotate-45">
                        +
                      </span>
                    </summary>
                    <p className="mt-3 text-sm leading-6 text-[#5f5f5f] dark:text-white/55">{item.answer}</p>
                  </details>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section id="contact" className="bg-[#ffd400] py-20 text-[#141414]">
          <div className="mx-auto grid w-[min(1180px,calc(100%-32px))] gap-10 lg:grid-cols-[1.2fr_.8fr] lg:items-center">
            <Reveal>
              <p className="text-[11px] font-black uppercase tracking-[0.22em]">Contact NNACT</p>
              <h2 className="mt-4 max-w-2xl text-4xl font-black leading-[1.05] tracking-[-0.045em] sm:text-5xl">
                Ready when equipment isn&apos;t.
              </h2>
              <p className="mt-5 max-w-xl text-lg leading-8 text-[#141414]/70">
                Book a visit for AC, refrigeration, electrical, solar, appliance, or maintenance work in Buea and
                Southwest Cameroon.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <BookVisitButton className="bg-[#141414] text-white outline-[#141414] hover:bg-black" />
                <Link
                  href="/account"
                  className="rounded-full border border-[#141414]/30 px-6 py-3 text-sm font-bold no-underline transition hover:bg-[#141414]/10"
                >
                  My account
                </Link>
              </div>
            </Reveal>

            <Reveal delay={80}>
              <div className="rounded-[28px] bg-[#141414] p-7 text-white">
                <div className="grid gap-5">
                  <div className="flex gap-3">
                    <MapPin className="mt-0.5 size-5 shrink-0 text-[#ffd400]" aria-hidden="true" />
                    <p className="text-sm leading-6 text-white/75">
                      {NNACT_COMPANY.location.streetAddress}, {NNACT_COMPANY.location.addressLocality}
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <Phone className="mt-0.5 size-5 shrink-0 text-[#ffd400]" aria-hidden="true" />
                    <div className="grid gap-1 text-sm">
                      {NNACT_COMPANY.contact.phones.map((number) => (
                        <a
                          key={number}
                          href={`tel:${number.replace(/\s/g, "")}`}
                          className="text-white/75 no-underline hover:text-white"
                        >
                          {number}
                        </a>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <Mail className="mt-0.5 size-5 shrink-0 text-[#ffd400]" aria-hidden="true" />
                    <a
                      href={`mailto:${NNACT_COMPANY.contact.email}`}
                      className="text-sm text-white/75 no-underline hover:text-white"
                    >
                      {NNACT_COMPANY.contact.email}
                    </a>
                  </div>
                  <a
                    href={buildWhatsAppUrl(NNACT_COMPANY.contact.phones[0])}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex justify-center rounded-full bg-[#ffd400] px-5 py-3 text-sm font-black text-[#141414] no-underline transition active:scale-[0.98]"
                  >
                    Chat on WhatsApp
                  </a>
                </div>
              </div>
            </Reveal>
          </div>

          <footer className="mx-auto mt-16 flex w-[min(1180px,calc(100%-32px))] flex-wrap items-center justify-between gap-3 border-t border-[#141414]/20 pt-6 text-xs font-semibold text-[#141414]/65">
            <span>{NNACT_COMPANY.legalName}</span>
            <span>Powered by NNACT Pro</span>
          </footer>
        </section>
      </main>

      <MobileBar />
    </div>
  );
}
