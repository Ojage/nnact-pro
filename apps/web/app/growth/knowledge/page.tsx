"use client";

import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  GROWTH_KNOWLEDGE_CATEGORY_LABELS,
  GROWTH_KNOWLEDGE_PROVENANCE_LABELS,
  GROWTH_KNOWLEDGE_STATUS_LABELS,
  type GrowthKnowledgeFactDTO,
} from "@nnact/shared";
import {
  useGrowthKnowledgeFactsQuery,
  useIngestGrowthWebsiteMutation,
  useReviewGrowthKnowledgeFactMutation,
} from "@/lib/redux/api";

function FactRow({ fact }: { fact: GrowthKnowledgeFactDTO }) {
  const [review] = useReviewGrowthKnowledgeFactMutation();
  return (
    <Card>
      <CardContent className="space-y-2 pt-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded bg-muted px-2 py-0.5 text-xs">
            {GROWTH_KNOWLEDGE_CATEGORY_LABELS[fact.category as keyof typeof GROWTH_KNOWLEDGE_CATEGORY_LABELS] ?? fact.category}
          </span>
          <span className="rounded bg-muted px-2 py-0.5 text-xs">
            {GROWTH_KNOWLEDGE_STATUS_LABELS[fact.status as keyof typeof GROWTH_KNOWLEDGE_STATUS_LABELS] ?? fact.status}
          </span>
          <span className="text-xs text-fg-muted">
            {GROWTH_KNOWLEDGE_PROVENANCE_LABELS[fact.provenance as keyof typeof GROWTH_KNOWLEDGE_PROVENANCE_LABELS] ?? fact.provenance}
          </span>
        </div>
        <p className="font-medium">{fact.subject}</p>
        {fact.supportingPassage ? (
          <p className="text-fg-muted italic">&ldquo;{fact.supportingPassage}&rdquo;</p>
        ) : null}
        {fact.sourceUrl ? (
          <a href={fact.sourceUrl} className="text-xs text-primary underline-offset-2 hover:underline" target="_blank" rel="noreferrer">
            Source: {fact.sourceTitle ?? fact.sourceUrl}
          </a>
        ) : null}
        {fact.status === "PENDING" ? (
          <div className="flex flex-wrap gap-2 pt-2">
            <Button size="sm" onClick={() => review({ id: fact.id, action: "APPROVE" })}>
              Approve
            </Button>
            <Button size="sm" variant="outline" onClick={() => review({ id: fact.id, action: "REJECT" })}>
              Reject
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function ProjectKnowledgePage() {
  const [website, setWebsite] = useState("nnact.com");
  const { data: facts = [], isLoading } = useGrowthKnowledgeFactsQuery({});
  const [ingest, { isLoading: ingesting }] = useIngestGrowthWebsiteMutation();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Project Knowledge"
        description="Source-backed company facts for outreach. Only approved claims may appear in campaigns."
      />
      <div className="flex flex-wrap gap-2">
        <Input value={website} onChange={(e) => setWebsite(e.target.value)} className="max-w-xs" placeholder="nnact.com" />
        <Button disabled={ingesting} onClick={() => ingest({ website: website.trim() })}>
          Ingest website
        </Button>
      </div>
      {isLoading ? <p className="text-sm text-fg-muted">Loading facts…</p> : null}
      <div className="space-y-3">
        {facts.map((f) => (
          <FactRow key={f.id} fact={f} />
        ))}
        {!isLoading && facts.length === 0 ? (
          <p className="text-sm text-fg-muted">No facts yet. Ingest your website or upload approved internal material.</p>
        ) : null}
      </div>
    </div>
  );
}
