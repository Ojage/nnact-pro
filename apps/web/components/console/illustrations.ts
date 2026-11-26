/**
 * Illustration slots for the service overview pages. Each entry names the file
 * the page expects under apps/web/public. Until a file is added, set `ready`
 * to false and the card shows a token-coloured placeholder instead of a
 * broken image. Drop the .webp in, flip `ready` to true, and it appears.
 */
export const OVERVIEW_ILLUSTRATIONS = {
  finance: { src: "/illustrations/finance-overview.webp", ready: false },
  operations: { src: "/illustrations/operations-overview.webp", ready: false },
  marketing: { src: "/illustrations/marketing-overview.webp", ready: false },
  quality: { src: "/illustrations/quality-overview.webp", ready: false },
  growth: { src: "/illustrations/growth-overview.webp", ready: false },
  system: { src: "/illustrations/system-overview.webp", ready: false },
} as const satisfies Record<string, { src: string; ready: boolean }>;

export type OverviewIllustration = keyof typeof OVERVIEW_ILLUSTRATIONS;

export function illustrationSrc(key: OverviewIllustration): string | undefined {
  const slot = OVERVIEW_ILLUSTRATIONS[key];
  return slot.ready ? slot.src : undefined;
}
