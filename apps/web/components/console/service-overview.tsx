"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import { useId } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";
import { PrefetchLink as Link } from "@/components/prefetch-link";
import { cn } from "@/lib/utils";
import { focusRing } from "./styles";

export type QuickAction = { label: string; href: string; icon: LucideIcon };
export type LearnLink = { label: string; href?: string; onClick?: () => void };

const chip =
  "inline-flex h-9 items-center gap-2 rounded-[8px] border border-[var(--shell-border)] px-3 text-sm font-medium text-fg no-underline transition-colors hover:border-[var(--shell-accent-bar)] hover:bg-[var(--shell-tint)] hover:no-underline " +
  focusRing;

/**
 * Illustration card (like the home page's "Learn NNACT Pro" card). The image
 * fills whatever height the left column leaves; with no image yet, a quiet
 * token-coloured placeholder with the section icon stands in.
 */
export function IllustrationCard({
  image,
  icon: Icon,
  title,
  copy,
  links,
  className,
}: {
  image?: string;
  icon?: LucideIcon;
  title: string;
  copy?: string;
  links?: LearnLink[];
  className?: string;
}) {
  const id = useId();
  return (
    <aside
      aria-labelledby={id}
      className={cn("flex min-w-0 flex-col overflow-hidden rounded-[8px] border border-[var(--shell-border)] bg-[var(--shell-panel)]", className)}
    >
      <div className="relative h-36 shrink-0 lg:h-auto lg:min-h-28 lg:flex-1">
        {image ? (
          <Image src={image} alt="" fill sizes="(min-width: 1024px) 19rem, 100vw" className="object-cover" />
        ) : (
          <div
            aria-hidden="true"
            className="absolute inset-0 grid place-items-center"
            style={{
              background:
                "radial-gradient(circle at 20% 20%, color-mix(in srgb, var(--shell-accent-bar) 22%, transparent), transparent 55%), radial-gradient(circle at 85% 80%, color-mix(in srgb, var(--console-info-fg) 14%, transparent), transparent 50%), var(--shell-canvas)",
            }}
          >
            {Icon ? (
              <span className="grid size-16 place-items-center rounded-[16px] border border-[var(--shell-border)] bg-[var(--shell-panel)] text-[var(--shell-accent-text)] shadow-sm">
                <Icon className="size-8" strokeWidth={1.5} />
              </span>
            ) : null}
          </div>
        )}
      </div>
      <div className="border-t border-[var(--shell-border)] px-4 py-3">
        <h2 id={id} className="text-sm font-medium leading-snug text-fg">
          {title}
        </h2>
        {copy ? <p className="mt-1 text-xs text-fg-muted">{copy}</p> : null}
        {links?.length ? (
          <ul className="mt-2 grid gap-1" role="list">
            {links.map((link) => {
              const cls = cn(
                "inline-flex items-center gap-1 rounded-sm text-sm font-medium text-[var(--shell-accent-text)] hover:underline",
                focusRing,
              );
              return (
                <li key={link.label}>
                  {link.href ? (
                    <Link href={link.href} className={cls}>
                      {link.label} <ChevronRight className="size-4" aria-hidden="true" />
                    </Link>
                  ) : (
                    <button type="button" onClick={link.onClick} className={cls}>
                      {link.label} <ChevronRight className="size-4" aria-hidden="true" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </aside>
  );
}

/**
 * Top of a service overview: title, what the service does, quick actions on
 * the left; the illustration card on the right at the same height.
 */
export function ServiceOverviewHero({
  title,
  description,
  icon: Icon,
  quickActions,
  meta,
  children,
  illustration,
}: {
  title: string;
  description: string;
  icon?: LucideIcon;
  quickActions?: QuickAction[];
  meta?: ReactNode;
  children?: ReactNode;
  illustration: Parameters<typeof IllustrationCard>[0];
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-stretch">
      <div className="grid min-w-0 content-start gap-4">
        <div className="flex items-center gap-3">
          {Icon ? (
            <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-[var(--shell-tint)] text-[var(--shell-accent-text)]" aria-hidden="true">
              <Icon className="size-5" />
            </span>
          ) : null}
          <h1 className="text-[22px] font-normal leading-tight text-fg sm:text-[28px]">{title}</h1>
        </div>
        <p className="max-w-2xl text-sm text-fg-muted">{description}</p>
        {meta ? <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-muted">{meta}</div> : null}
        {quickActions?.length ? (
          <nav aria-label={`${title} quick actions`}>
            <ul className="flex flex-wrap gap-2" role="list">
              {quickActions.map(({ label, href, icon: ActionIcon }) => (
                <li key={href + label}>
                  <Link href={href} className={chip}>
                    <ActionIcon className="size-4 text-fg-muted" aria-hidden="true" />
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
        {children}
      </div>
      <IllustrationCard {...illustration} />
    </div>
  );
}

export type ProductTile = { href: string; icon: LucideIcon; name: string; description: string; meta?: string };

/** The section's sub-pages as product tiles, the way GCP lists a service's features. */
export function ProductTiles({ title = "Products in this section", tiles }: { title?: string; tiles: ProductTile[] }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="grid gap-3">
      <h2 id={id} className="text-lg font-normal text-fg">
        {title}
      </h2>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" role="list">
        {tiles.map(({ href, icon: Icon, name, description, meta }) => (
          <li key={href} className="min-w-0">
            <Link
              href={href}
              className={cn(
                "group flex h-full gap-3 rounded-[8px] border border-[var(--shell-border)] bg-[var(--shell-panel)] p-4 no-underline transition-colors hover:border-[var(--shell-accent-bar)] hover:bg-[var(--shell-canvas)] hover:no-underline",
                focusRing,
              )}
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-[8px] bg-[var(--shell-canvas)] text-[var(--shell-accent-text)] group-hover:bg-[var(--shell-tint)]" aria-hidden="true">
                <Icon className="size-[18px]" />
              </span>
              <span className="grid min-w-0 content-start gap-0.5">
                <span className="text-sm font-medium text-fg group-hover:text-[var(--shell-accent-text)]">{name}</span>
                <span className="text-xs text-fg-muted">{description}</span>
                {meta ? <span className="mt-1 text-xs font-medium tabular-nums text-fg">{meta}</span> : null}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export type ResourceRow = { id: string; href: string; primary: string; secondary?: ReactNode; trailing?: ReactNode; status?: ReactNode };

/** Compact list of recent / attention items inside a panel. */
export function ResourceList({ rows, empty }: { rows: ResourceRow[]; empty: string }) {
  if (rows.length === 0) return <p className="px-4 py-6 text-center text-sm text-fg-muted">{empty}</p>;
  return (
    <ul role="list">
      {rows.map((row) => (
        <li key={row.id} className="flex min-w-0 items-center gap-3 border-b border-[var(--shell-border)] px-4 py-2.5 last:border-b-0">
          <span className="grid min-w-0 flex-1">
            <Link href={row.href} className={cn("truncate text-sm font-medium text-[var(--shell-accent-text)] hover:underline", focusRing)}>
              {row.primary}
            </Link>
            {row.secondary ? <span className="truncate text-xs text-fg-muted">{row.secondary}</span> : null}
          </span>
          {row.status ? <span className="hidden shrink-0 sm:inline-flex">{row.status}</span> : null}
          {row.trailing ? <span className="shrink-0 text-right text-sm tabular-nums text-fg">{row.trailing}</span> : null}
        </li>
      ))}
    </ul>
  );
}
