"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { WalkthroughPlacement } from "@nnact/shared";

/**
 * Dims the page around a [data-tour] target. Uses the classic driver-style
 * box-shadow "hole": a fixed, pointer-events-none element laid exactly over the
 * target whose 9999px box-shadow dims everything else. Because it never
 * intercepts pointers, users keep interacting with the real page while the
 * tour runs (non-blocking by construction). A `center` placement renders a
 * flat full-screen dim for info/tip/success steps without anchors.
 */

const DIM = "rgba(2, 6, 23, 0.55)";

export interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function rectOf(el: Element): SpotlightRect {
  const rect = el.getBoundingClientRect();
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
}

export function useElementRect(el: Element | null): SpotlightRect | null {
  const [rect, setRect] = useState<SpotlightRect | null>(null);

  useEffect(() => {
    if (!el) {
      setRect(null);
      return;
    }
    const read = () => setRect(rectOf(el));
    read();
    window.addEventListener("resize", read);
    window.addEventListener("scroll", read, true);
    return () => {
      window.removeEventListener("resize", read);
      window.removeEventListener("scroll", read, true);
    };
  }, [el]);

  return rect;
}

export function Spotlight({
  rect,
  radius = 12,
  placement,
}: {
  rect?: SpotlightRect | null;
  radius?: number;
  placement?: WalkthroughPlacement;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  if (typeof document === "undefined") return null;
  if (!rect || placement === "center") {
    return createPortal(
      <div
        aria-hidden="true"
        className="fixed inset-0 z-[90] pointer-events-none"
        style={{
          background: DIM,
          opacity: mounted ? 1 : 0,
          transition: "opacity 160ms ease",
        }}
      />,
      document.body,
    );
  }

  return createPortal(
    <div
      aria-hidden="true"
      className="fixed pointer-events-none z-[90]"
      style={{
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        borderRadius: Math.min(radius, rect.height / 2),
        boxShadow: `0 0 0 9999px ${DIM}`,
        opacity: mounted ? 1 : 0,
        transition: "opacity 160ms ease",
      }}
    />,
    document.body,
  );
}