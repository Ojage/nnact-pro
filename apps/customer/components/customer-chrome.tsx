import Image from "next/image";
import Link from "next/link";
import { NNACT_COMPANY, NNACT_PRODUCT } from "@nnact/shared";
import { cn } from "@/lib/utils";

export function CustomerHeader({ compact = false }: { compact?: boolean }) {
  return (
    <header className="border-b border-border bg-surface-50/95 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-[min(1080px,calc(100%-32px))] items-center justify-between gap-4">
        <Link href="/" className="flex min-w-0 items-center gap-3 no-underline">
          <span className="relative flex h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-accent shadow-sm">
            <Image src="/nnact-logo.jpeg" alt={`${NNACT_COMPANY.shortName} logo`} fill sizes="40px" className="object-cover" priority />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-black tracking-tight text-fg">{NNACT_COMPANY.shortName}</p>
            <p className="truncate text-[10px] text-fg-dim">{NNACT_COMPANY.tagline}</p>
          </div>
        </Link>
        {!compact ? (
          <nav className="hidden items-center gap-5 text-sm font-semibold text-fg-muted md:flex">
            <Link href="/book" className="no-underline hover:text-fg">Request service</Link>
            <a href={`tel:${NNACT_COMPANY.contact.phones[0].replace(/\s/g, "")}`} className="no-underline hover:text-fg">
              Call us
            </a>
          </nav>
        ) : null}
        <Link
          href="/book"
          className="shrink-0 rounded-full bg-accent px-4 py-2 text-sm font-black text-white no-underline hover:bg-accent-hover"
        >
          Book service
        </Link>
      </div>
    </header>
  );
}

export function CustomerFooter({ className }: { className?: string }) {
  return (
    <footer className={cn("border-t border-border bg-surface-50 py-8 text-sm text-fg-dim", className)}>
      <div className="mx-auto flex w-[min(1080px,calc(100%-32px))] flex-wrap items-start justify-between gap-6">
        <div>
          <p className="font-bold text-fg">{NNACT_COMPANY.legalName}</p>
          <p className="mt-1 max-w-md text-xs leading-6">{NNACT_COMPANY.customerPromise}</p>
        </div>
        <div className="text-xs leading-6">
          <p>{NNACT_COMPANY.location.streetAddress}</p>
          <p>{NNACT_COMPANY.location.addressLocality}, {NNACT_COMPANY.location.addressRegion}</p>
          <p className="mt-2">{NNACT_COMPANY.contact.email}</p>
          <p>{NNACT_COMPANY.contact.phones.join(" · ")}</p>
        </div>
      </div>
      <p className="mx-auto mt-6 w-[min(1080px,calc(100%-32px))] text-[10px]">
        Powered by {NNACT_PRODUCT.name}
      </p>
    </footer>
  );
}
