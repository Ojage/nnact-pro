"use client";

import { useState, useEffect, useCallback } from "react";
import type { NotificationDTO } from "@nnact/shared";
import { api } from "@/lib/api";
import { connectNotificationStream } from "@/lib/notifications-live";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function NotificationsPopover() {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [notifs, setNotifs] = useState<NotificationDTO[]>([]);
  const [loading, setLoading] = useState(false);

  const refreshUnread = useCallback(() => {
    void api.unreadNotificationCount()
      .then((r) => setUnread(r.count))
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshUnread();
    const token = localStorage.getItem("NNPtoken");
    if (!token) return;

    const teardown = connectNotificationStream(token, {
      onUnreadCount: setUnread,
      onNotification: (notification) => {
        setNotifs((prev) => [notification, ...prev.filter((n) => n.id !== notification.id)]);
        setUnread((u) => u + 1);
      },
      onFieldRefresh: () => refreshUnread(),
    });

    return teardown;
  }, [refreshUnread]);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.notifications();
      setNotifs(list);
    } catch {
      /* silent */
    }
    setLoading(false);
  }, []);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) void loadNotifications();
  };

  const handleMarkRead = async (n: NotificationDTO) => {
    if (!n.read) {
      try {
        await api.markNotificationRead(n.id);
        setUnread((u) => Math.max(0, u - 1));
        setNotifs((prev) => prev.map((item) => (item.id === n.id ? { ...item, read: true } : item)));
      } catch {
        /* silent */
      }
    }
    if (n.link) window.location.href = n.link;
  };

  const handleMarkAllRead = async () => {
    try {
      await api.markAllNotificationsRead();
      setUnread(0);
      setNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch {
      /* silent */
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative rounded-lg border-none bg-surface-300 p-1.5 text-fg-muted transition-colors hover:bg-surface-400 hover:text-fg"
          aria-label="Notifications"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red text-[10px] font-bold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        side="right"
        align="start"
        sideOffset={10}
        collisionPadding={12}
        className="w-[min(360px,calc(100vw-1.5rem))] overflow-hidden rounded-xl border-border bg-surface-200 p-0 shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-sm font-semibold text-fg">Notifications</span>
          {unread > 0 && (
            <button
              type="button"
              onClick={() => void handleMarkAllRead()}
              className="cursor-pointer border-none bg-transparent text-xs text-fg-link transition-colors hover:text-fg"
            >
              Mark all read
            </button>
          )}
        </div>

        <div className="max-h-[min(400px,calc(100dvh-8rem))] overflow-y-auto">
          {loading ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="mt-1 h-2 w-2 shrink-0 rounded-full" />
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : notifs.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm text-fg-muted">No notifications yet</p>
            </div>
          ) : (
            notifs.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => void handleMarkRead(n)}
                className="w-full cursor-pointer border-b border-border border-none bg-transparent px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-surface-300"
              >
                <div className="flex items-start gap-3">
                  {!n.read ? (
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue" />
                  ) : (
                    <span className="mt-1.5 h-2 w-2 shrink-0" aria-hidden="true" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm leading-snug ${n.read ? "text-fg-muted" : "font-medium text-fg"}`}>
                      {n.title}
                    </p>
                    {n.body ? (
                      <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-fg-dim">{n.body}</p>
                    ) : null}
                    <p className="mt-1 text-[11px] text-fg-dim">{formatTimeAgo(n.createdAt)}</p>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
