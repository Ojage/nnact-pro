"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { JobVoiceNoteDTO } from "@nnact/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useJobVoiceNotesQuery } from "@/lib/redux/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`;
}

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function VoiceNotePlayer({ note, autoPlay }: { note: JobVoiceNoteDTO; autoPlay?: boolean }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let objectUrl: string | null = null;
    const token = localStorage.getItem("NNPtoken");
    void fetch(`${API_URL}/api/voice-notes/${note.id}/file`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    })
      .then((r) => r.blob())
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .finally(() => setLoading(false));

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [note.id]);

  useEffect(() => {
    if (autoPlay && src && audioRef.current) {
      void audioRef.current.play().catch(() => {});
    }
  }, [autoPlay, src]);

  return (
    <div className="rounded-xl border border-border bg-surface-200 p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-fg truncate">{note.authorName}</p>
          <p className="text-xs text-fg-dim">
            {formatDuration(note.durationMs)} · {formatTimeAgo(note.createdAt)}
          </p>
        </div>
        <span className="text-[10px] font-bold uppercase tracking-wide text-accent">Voice</span>
      </div>
      {loading ? (
        <Skeleton className="h-10 w-full rounded-lg" />
      ) : src ? (
        <audio ref={audioRef} controls preload="metadata" src={src} className="w-full h-10" />
      ) : (
        <p className="text-xs text-fg-muted">Could not load audio</p>
      )}
    </div>
  );
}

export function JobVoiceNotesPanel({ jobId }: { jobId: string }) {
  const { data: notes = [], isLoading, refetch } = useJobVoiceNotesQuery(jobId, { skip: !jobId });
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const onLiveVoiceNote = useCallback(
    (event: Event) => {
      const detail = (event as CustomEvent<{ jobId?: string; voiceNote?: JobVoiceNoteDTO }>).detail;
      if (detail?.jobId !== jobId) return;
      void refetch();
      if (detail.voiceNote?.id) {
        setHighlightId(detail.voiceNote.id);
        setTimeout(() => setHighlightId(null), 8000);
      }
    },
    [jobId, refetch],
  );

  useEffect(() => {
    window.addEventListener("nnact:voice-note", onLiveVoiceNote);
    return () => window.removeEventListener("nnact:voice-note", onLiveVoiceNote);
  }, [onLiveVoiceNote]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Field voice notes</CardTitle>
        <p className="text-sm text-fg-muted">Technician recordings arrive here in real time.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
          </div>
        ) : notes.length === 0 ? (
          <p className="text-sm text-fg-muted py-4 text-center">No voice notes yet for this job.</p>
        ) : (
          notes.map((note) => (
            <div
              key={note.id}
              className={highlightId === note.id ? "ring-2 ring-accent rounded-xl" : undefined}
            >
              <VoiceNotePlayer note={note} autoPlay={highlightId === note.id} />
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
