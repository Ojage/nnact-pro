"use client";

import { useState } from "react";
import { toast } from "sonner";
import { GROWTH_INBOX_VIEWS, type GrowthInboxView } from "@nnact/shared";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  useAddGrowthInboxThreadNoteMutation,
  useGrowthConversationsSearchQuery,
  useGrowthInboxMessagesQuery,
  useGrowthInboxThreadNotesQuery,
  usePatchGrowthInboxThreadMutation,
  useSendGrowthThreadReplyMutation,
  explainRtkError,
} from "@/lib/redux/api";
import { useSessionUser } from "@/lib/use-session-user";

const VIEW_LABELS: Record<GrowthInboxView, string> = {
  all: "All",
  needs_reply: "Needs reply",
  all_replies: "All replies",
  sent: "Sent",
  interested: "Interested",
  meeting: "Meeting requested",
  unsubscribe: "Unsubscribe",
  complaint: "Complaint",
  failed: "Failed",
};

export default function UnifiedInboxPage() {
  const [q, setQ] = useState("");
  const [view, setView] = useState<GrowthInboxView>("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [replyText, setReplyText] = useState("");

  const { data: threads = [], refetch } = useGrowthConversationsSearchQuery({
    q: q.trim() || undefined,
    view: view === "all" ? undefined : view,
  });
  const { data: messages = [] } = useGrowthInboxMessagesQuery(selected ?? "", { skip: !selected });
  const { data: notes = [] } = useGrowthInboxThreadNotesQuery(selected ?? "", { skip: !selected });
  const [addNote] = useAddGrowthInboxThreadNoteMutation();
  const [patchThread] = usePatchGrowthInboxThreadMutation();
  const [sendReply, { isLoading: sending }] = useSendGrowthThreadReplyMutation();
  const { user } = useSessionUser();
  // Replying is write-level staff work, matching the route gate. Read-only
  // Growth roles can triage and take notes but cannot send mail.
  const canReply = user?.role === "owner" || user?.role === "dispatcher" || user?.role === "secretary";

  const selectedThread = threads.find((t) => t.id === selected);

  async function markHandled() {
    if (!selected) return;
    try {
      await patchThread({ threadId: selected, needsHumanReply: false }).unwrap();
      toast.success("Marked as handled");
      refetch();
    } catch (error) {
      toast.error(explainRtkError(error, "Could not update thread"));
    }
  }

  async function saveNote() {
    if (!selected || !noteText.trim()) return;
    try {
      await addNote({ threadId: selected, body: noteText.trim() }).unwrap();
      setNoteText("");
      toast.success("Note saved");
    } catch (error) {
      toast.error(explainRtkError(error, "Could not save note"));
    }
  }

  async function submitReply() {
    if (!selected || !replyText.trim()) return;
    try {
      const result = await sendReply({ threadId: selected, bodyText: replyText.trim() }).unwrap();
      setReplyText("");
      if (result.duplicate) {
        toast.info("That reply was already sent");
      } else {
        toast.success("Reply sent");
      }
    } catch (error) {
      toast.error(explainRtkError(error, "Could not send reply"));
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Unified Inbox"
        description="Filter by intent, see which NNACT sender reached each prospect, and triage with notes."
      />
      <Input
        placeholder="Search company, subject, or message text…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="max-w-md"
      />
      <div className="flex flex-wrap gap-2">
        {GROWTH_INBOX_VIEWS.map((v) => (
          <Button
            key={v}
            size="sm"
            variant={view === v ? "default" : "outline"}
            onClick={() => setView(v)}
          >
            {VIEW_LABELS[v]}
          </Button>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2 max-h-[32rem] overflow-y-auto">
          {threads.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSelected(t.id)}
              className={`w-full rounded-lg border p-3 text-left text-sm ${selected === t.id ? "border-primary" : "border-border"}`}
            >
              <p className="font-medium">{t.companyName ?? "Prospect"}</p>
              <p className="text-xs text-fg-muted">{t.subject ?? "No subject"}</p>
              {t.senderEmail ? (
                <p className="text-xs text-fg-muted">
                  Sent from: {t.senderDisplayName} &lt;{t.senderEmail}&gt;
                </p>
              ) : null}
              {t.lastIntent ? <p className="text-xs text-fg-muted">Intent: {t.lastIntent}</p> : null}
              {t.needsHumanReply ? <p className="text-xs text-amber-600">Needs human reply</p> : null}
            </button>
          ))}
          {threads.length === 0 ? <p className="text-sm text-fg-muted">No threads in this view.</p> : null}
        </div>
        <Card>
          <CardContent className="space-y-3 pt-4 text-sm">
            {selected ? (
              <>
                {selectedThread?.needsHumanReply ? (
                  <Button size="sm" variant="outline" onClick={markHandled}>
                    Mark handled
                  </Button>
                ) : null}
                {messages.map((m) => (
                  <div key={m.id} className="rounded border border-border p-2">
                    <p className="text-xs text-fg-muted">
                      {m.direction} · {m.fromEmail} → {m.toEmail}
                      {m.intent ? ` · ${m.intent}` : ""}
                    </p>
                    <p className="whitespace-pre-wrap">{m.bodyText}</p>
                  </div>
                ))}
                <div className="border-t border-border pt-3">
                  <p className="mb-2 text-xs font-semibold text-fg-muted">Reply</p>
                  {canReply ? (
                    <>
                      <Textarea
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        rows={4}
                        placeholder={`Reply to ${selectedThread?.senderEmail ?? "this prospect"}…`}
                      />
                      <div className="mt-2 flex items-center gap-2">
                        <Button size="sm" onClick={submitReply} disabled={sending || !replyText.trim()}>
                          {sending ? "Sending…" : "Send reply"}
                        </Button>
                        <p className="text-xs text-fg-muted">
                          Sends as the thread&apos;s NNACT sender and is recorded in the outbound log.
                        </p>
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-fg-muted">
                      Your role can read this inbox but cannot send replies.
                    </p>
                  )}
                </div>
                <div className="border-t border-border pt-3">
                  <p className="mb-2 text-xs font-semibold text-fg-muted">Internal notes</p>
                  {notes.map((n) => (
                    <p key={n.id} className="mb-1 text-xs text-fg-muted">
                      {n.authorName ?? "Staff"}: {n.body}
                    </p>
                  ))}
                  <Textarea
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    rows={2}
                    placeholder="Add a note or handoff…"
                  />
                  <Button size="sm" className="mt-2" onClick={saveNote}>
                    Save note
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-fg-muted">Select a thread to view message history.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
