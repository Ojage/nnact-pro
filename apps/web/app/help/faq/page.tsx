"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { FAQ_ENTRIES, faqCategorySummaries, searchFaq } from "@/lib/faq-data";

export default function HelpFaqPage() {
  const [query, setQuery] = useState("");
  const categories = faqCategorySummaries();
  const results = useMemo(() => searchFaq(query), [query]);

  // In search mode, one flat result list reads better than ten partial
  // categories: the person is looking for a specific answer, not browsing.
  const searching = query.trim().length > 0;
  const grouped = useMemo(
    () =>
      categories
        .map((c) => ({ ...c, entries: results.filter((e) => e.category === c.category) }))
        .filter((c) => c.entries.length > 0),
    [categories, results],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="FAQ"
        description="How NNACT Pro actually behaves — the screens, the limits, and the rules that stop an action."
      />

      <div className="sticky top-0 z-10 space-y-3 bg-bg py-3">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the FAQ — try “bounce”, “quiet hours”, “autopilot”, “publish”…"
          aria-label="Search the FAQ"
        />
        {!searching ? (
          <nav className="flex flex-wrap gap-2" aria-label="FAQ categories">
            {categories.map((c) => (
              <a
                key={c.category}
                href={`#${c.anchor}`}
                className="rounded-full border border-border px-3 py-1 text-xs text-fg-muted hover:border-primary hover:text-fg"
              >
                {c.category} ({c.count})
              </a>
            ))}
          </nav>
        ) : (
          <p className="text-xs text-fg-muted">
            {results.length} {results.length === 1 ? "answer" : "answers"}
            {results.length === 0 ? " — try a shorter search" : " match"}
            <Button size="sm" variant="ghost" className="ml-2 h-6 px-2 text-xs" onClick={() => setQuery("")}>
              Clear
            </Button>
          </p>
        )}
      </div>

      {searching && results.length === 0 ? (
        <p className="text-sm text-fg-muted">
          Nothing matches “{query.trim()}”. Try a single word — the search matches whole words across every
          question and answer, so more words narrows rather than widens the results.
        </p>
      ) : null}

      <div className="space-y-8">
        {grouped.map((group) => (
          <section key={group.category} id={group.anchor} className="scroll-mt-28 space-y-2">
            <h2 className="text-sm font-semibold">
              {group.category}
              <span className="ml-2 text-xs font-normal text-fg-muted">
                {group.entries.length} {group.entries.length === 1 ? "answer" : "answers"}
              </span>
            </h2>
            {group.entries.map((entry) => (
              <Collapsible key={entry.id} className="rounded-lg border border-border">
                <CollapsibleTrigger className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left text-sm font-medium hover:bg-fg-muted/5">
                  <span>{entry.question}</span>
                  <span aria-hidden className="mt-0.5 shrink-0 text-fg-muted">
                    +
                  </span>
                </CollapsibleTrigger>
                <CollapsibleContent className="px-4 pb-4 text-sm text-fg-muted">{entry.answer}</CollapsibleContent>
              </Collapsible>
            ))}
          </section>
        ))}
      </div>

      <p className="border-t border-border pt-4 text-xs text-fg-muted">
        This FAQ documents the current build. {FAQ_ENTRIES.length} answers across {categories.length} categories. If
        something here does not match what you see on screen, that is a bug worth reporting — the answers are
        written against the code that enforces the behaviour, not against the intended design.
      </p>
    </div>
  );
}
