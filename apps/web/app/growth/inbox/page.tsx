"use client";

import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { useGrowthInboxMessagesQuery, useGrowthInboxThreadsQuery } from "@/lib/redux/api";

export default function UnifiedInboxPage() {
  const { data: threads = [] } = useGrowthInboxThreadsQuery();
  const [selected, setSelected] = useState<string | null>(null);
  const { data: messages = [] } = useGrowthInboxMessagesQuery(selected ?? "", { skip: !selected });

  return (
    <div className="space-y-6">
      <PageHeader title="Unified Inbox" description="Replies that need a human are flagged; verification requests show the real sender." />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          {threads.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSelected(t.id)}
              className={`w-full rounded-lg border p-3 text-left text-sm ${selected === t.id ? "border-primary" : "border-border"}`}
            >
              <p className="font-medium">{t.companyName ?? "Prospect"}</p>
              <p className="text-xs text-fg-muted">{t.subject ?? "No subject"}</p>
              {t.needsHumanReply ? <p className="text-xs text-amber-600">Needs human reply</p> : null}
              {t.verificationRequestedAt ? (
                <p className="text-xs text-fg-muted">
                  Sender: {t.senderDisplayName} &lt;{t.senderEmail}&gt;
                </p>
              ) : null}
            </button>
          ))}
          {threads.length === 0 ? <p className="text-sm text-fg-muted">No threads yet.</p> : null}
        </div>
        <Card>
          <CardContent className="space-y-3 pt-4 text-sm">
            {selected ? (
              messages.map((m) => (
                <div key={m.id} className="rounded border border-border p-2">
                  <p className="text-xs text-fg-muted">
                    {m.direction} · {m.fromEmail} → {m.toEmail}
                    {m.intent ? ` · ${m.intent}` : ""}
                  </p>
                  <p className="whitespace-pre-wrap">{m.bodyText}</p>
                </div>
              ))
            ) : (
              <p className="text-fg-muted">Select a thread to view message history.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
