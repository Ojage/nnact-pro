"use client";

import { useSyncExternalStore } from "react";

export type NavigationPendingState = {
  pending: boolean;
  pendingHref: string | null;
};

type NavListener = (state: NavigationPendingState) => void;

const IDLE_SNAPSHOT: NavigationPendingState = { pending: false, pendingHref: null };

function normalizeHref(href: string): string {
  return href.split("?")[0]?.split("#")[0] ?? href;
}

/** Instant navigation feedback — tracks which route is loading. */
class NavigationPendingStore {
  pending = false;
  pendingHref: string | null = null;
  private cachedSnapshot: NavigationPendingState = IDLE_SNAPSHOT;
  private listeners = new Set<NavListener>();

  subscribe(listener: NavListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): NavigationPendingState {
    return this.cachedSnapshot;
  }

  private syncSnapshot(): void {
    const nextPending = this.pending;
    const nextHref = this.pendingHref;
    const current = this.cachedSnapshot;
    if (current.pending === nextPending && current.pendingHref === nextHref) return;

    this.cachedSnapshot =
      nextPending === IDLE_SNAPSHOT.pending && nextHref === IDLE_SNAPSHOT.pendingHref
        ? IDLE_SNAPSHOT
        : { pending: nextPending, pendingHref: nextHref };
  }

  private emit(): void {
    this.syncSnapshot();
    for (const listener of this.listeners) listener(this.cachedSnapshot);
  }

  start(href: string): void {
    const path = normalizeHref(href);
    this.pending = true;
    this.pendingHref = path;
    this.emit();
  }

  complete(): void {
    if (!this.pending && !this.pendingHref) return;
    this.pending = false;
    this.pendingHref = null;
    this.emit();
  }
}

export const navigationPendingStore = new NavigationPendingStore();

/** True when navigation to this nav item (or a child route) is in progress. */
export function navItemIsPending(pendingHref: string | null, itemHref: string): boolean {
  if (!pendingHref) return false;
  if (itemHref === "/") return pendingHref === "/";
  return pendingHref === itemHref || pendingHref.startsWith(`${itemHref}/`);
}

export function useNavigationPending(): NavigationPendingState {
  return useSyncExternalStore(
    (listener) => navigationPendingStore.subscribe(listener),
    () => navigationPendingStore.getSnapshot(),
    () => IDLE_SNAPSHOT,
  );
}
