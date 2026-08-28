"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { NotificationDTO } from "@nnact/shared";
import { api } from "@/lib/api";
import { connectNotificationStream } from "@/lib/notifications-live";
import { Skeleton } from "@/components/ui/skeleton";

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
  const ref = useRef<HTMLDivElement>(null);

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

  const handleOpen = () => {
    setOpen((o) => !o);
    if (!open) loadNotifications();
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

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
    <div ref={ref} className="relative">
      <button
        onClick={handleOpen}
        className="relative p-1.5 rounded-lg bg-surface-300 hover:bg-surface-400 transition-colors cursor-pointer border-none text-fg-muted hover:text-fg"
        aria-label="Notifications"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red text-[10px] font-bold text-white flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[360px] rounded-xl border border-border bg-surface-200 shadow-xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="text-sm font-semibold text-fg">Notifications</span>
            {unread > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-fg-link hover:text-fg transition-colors cursor-pointer bg-transparent border-none"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[400px] overflow-y-auto">
            {loading ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex gap-3">
                    <Skeleton className="w-2 h-2 rounded-full mt-1 shrink-0" />
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
                  onClick={() => handleMarkRead(n)}
                  className="w-full text-left px-4 py-3 hover:bg-surface-300 transition-colors cursor-pointer border-b border-border last:border-b-0 bg-transparent border-none"
                >
                  <div className="flex items-start gap-3">
                    {!n.read && <span className="w-2 h-2 rounded-full bg-blue shrink-0 mt-1.5" />}
                    <div className={`flex-1 min-w-0 ${n.read ? "ml-5" : ""}`}>
                      <p className={`text-sm ${n.read ? "text-fg-muted" : "text-fg"} truncate`}>
                        {n.title}
                      </p>
                      {n.body && (
                        <p className="text-xs text-fg-dim mt-0.5 line-clamp-2">{n.body}</p>
                      )}
                      <p className="text-[11px] text-fg-dim mt-1">{formatTimeAgo(n.createdAt)}</p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
