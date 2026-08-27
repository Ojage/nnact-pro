/**
 * DOM target resolution for [data-tour] elements.
 *
 * Targets resolve lazily: pages render after async data, dialogs open on a
 * click, and SPA navigations swap the tree. `waitForTarget` probes with a
 * bounded backoff and only counts visible elements, so the coachmark never
 * points at a hidden or zero-size node. Resolving is async only — the main
 * thread is never blocked.
 */

import { targetSelector } from "./runtime";

export interface ResolveOptions {
  /** Max attempts, each spaced `interval` apart. */
  tries?: number;
  /** Delay between attempts, ms. */
  interval?: number;
  /** Reject display:none / zero-size elements. Defaults to true. */
  visibleOnly?: boolean;
}

export const DEFAULT_RESOLVE_OPTIONS: Required<Pick<ResolveOptions, "tries" | "interval" | "visibleOnly">> = {
  tries: 14,
  interval: 250,
  visibleOnly: true,
};

export function resolveTargetNow(id: string, visibleOnly = true): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const el = document.querySelector<HTMLElement>(targetSelector(id));
  if (!el) return null;
  if (visibleOnly) {
    if (el.hidden) return null;
    if (getComputedStyle(el).display === "none") return null;
    if (getComputedStyle(el).visibility === "hidden") return null;
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return null;
  }
  return el;
}

/** Awaitable bounded-retry resolution — the engine's default lookup. */
export function waitForTarget(id: string, options: ResolveOptions = {}): Promise<HTMLElement | null> {
  const { tries, interval, visibleOnly } = { ...DEFAULT_RESOLVE_OPTIONS, ...options };
  return new Promise((resolve) => {
    let attempt = 0;
    const probe = () => {
      const el = resolveTargetNow(id, visibleOnly);
      if (el || attempt >= tries) {
        resolve(el);
        return;
      }
      attempt += 1;
      setTimeout(probe, interval);
    };
    probe();
  });
}

/** Bounded synchronous single-shot: one probe now, never blocks. */
export function resolveTarget(id: string, options: ResolveOptions = {}): HTMLElement | null {
  const { visibleOnly } = { ...DEFAULT_RESOLVE_OPTIONS, ...options };
  return resolveTargetNow(id, visibleOnly);
}