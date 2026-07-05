export type SponsorSurface = "dashboard" | "mobile" | "customer_portal" | "vendor_guide";

export interface SponsorSlotConfig {
  id: string;
  label: "Sponsored" | "Partner" | string;
  surface: SponsorSurface;
  trade: "all" | "hvac" | "plumbing" | "electrical" | "cleaning" | string;
  region: "default" | string;
  sponsorName: string;
  message: string;
  url?: string;
  active: boolean;
}

export interface SponsorConfig {
  enabled: boolean;
  placementPolicy: "free-tier-only" | "always" | "disabled";
  privacy: {
    tracking: false;
    remoteAdNetwork: false;
    behavioralTargeting: false;
  };
  slots: SponsorSlotConfig[];
}

export function pickSponsorSlot(
  config: SponsorConfig,
  surface: SponsorSurface,
  trade = "all",
  region = "default",
): SponsorSlotConfig | null {
  if (!config.enabled || config.placementPolicy === "disabled") return null;
  return (
    config.slots.find(
      (slot) =>
        slot.active &&
        slot.surface === surface &&
        (slot.trade === trade || slot.trade === "all") &&
        (slot.region === region || slot.region === "default"),
    ) ?? null
  );
}
