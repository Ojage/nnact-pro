import type { ReactNode } from "react";
import { formatRelativeTime } from "@/lib/utils";

export type ActivityEntry = { id: string; summary: ReactNode; createdAt: string; kind?: string };

/** Console activity feed: time on the left, event on the right, newest first. */
export function ActivityList({ items, empty = "No activity yet." }: { items: readonly ActivityEntry[]; empty?: string }) {
  if (items.length === 0) return <p className="py-6 text-center text-sm text-fg-muted">{empty}</p>;
  return (
    <ol className="grid" role="list">
      {items.map((item) => {
        const date = new Date(item.createdAt);
        return (
          <li
            key={item.id}
            className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)] gap-x-4 border-b border-[var(--shell-border)] py-2.5 text-sm last:border-b-0"
          >
            <time dateTime={item.createdAt} title={date.toLocaleString()} className="text-xs tabular-nums text-fg-muted">
              {formatRelativeTime(item.createdAt)}
            </time>
            <span className="min-w-0 break-words text-fg">
              {item.kind ? (
                <span className="mr-2 rounded-[4px] bg-[var(--shell-canvas)] px-1.5 py-px font-mono text-[11px] text-fg-muted">
                  {item.kind.replaceAll("_", " ")}
                </span>
              ) : null}
              {item.summary}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
