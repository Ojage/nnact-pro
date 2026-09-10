// AI content automation — domain layer.
// Provider configs (decrypted view), scheduling logic for Africa/Douala-style
// fixed-offset zones, slot idempotency keys, and cheap deterministic hashing
// used by the fake provider and the duplicate detector. No HTTP and no DB here.
import type {
  AiAutomationSettingsDTO,
  AiProviderId,
  AiSlot,
  TextGenerationResult,
} from "@nnact/shared";

/** Runtime view of a stored provider config with the API key decrypted. */
export interface DecryptedProviderConfig {
  provider: AiProviderId;
  apiKey: string;
  baseUrl: string | null;
  timeoutMs: number;
  defaultTextModel: string | null;
  defaultImageModel: string | null;
  options: Record<string, unknown>;
}

export function slotKey(orgId: string, isoDate: string, slot: AiSlot): string {
  return `${orgId}:${isoDate}:${slot}`;
}

export function parseSlotKey(key: string): { orgId: string; isoDate: string; slot: AiSlot } {
  const [orgId, isoDate, slot] = key.split(":");
  return { orgId, isoDate, slot: slot as AiSlot };
}

// ── Fixed-offset timezone scheduling ───────────────────────────────────────
// The org timezone strings are free text; African zones we target have no DST.
// Keep an explicit fixed-offset table and fall back to UTC + a console warning
// rather than pulling a tz database into the worker.
const ZONE_OFFSET_MINUTES: Record<string, number> = {
  "Africa/Douala": 60,
  "Africa/Lagos": 60,
  "Africa/Casablanca": 0,
  UTC: 0,
  GMT: 0,
};

export function zoneOffsetMinutes(timezone: string | null | undefined): number {
  const tz = timezone?.trim();
  if (tz && tz in ZONE_OFFSET_MINUTES) return ZONE_OFFSET_MINUTES[tz];
  if (tz && /^Africa\/.+$/.test(tz)) {
    return tz === "Africa/Casablanca" ? 0 : 60; // no DST in the fixed Africa zones
  }
  if (tz && tz !== "UTC" && tz !== "GMT") {
    console.warn(`[ai] unknown timezone "${tz}", treating as UTC`);
  }
  return 0;
}

export interface WallParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  dayName: string; // MON..SUN
  hour: number;
  minute: number;
}

export function wallParts(utc: Date, offsetMinutes: number): WallParts {
  const shifted = new Date(utc.getTime() + offsetMinutes * 60_000);
  const dayName = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][shifted.getUTCDay()];
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    dayName,
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

export function toUtc(wall: { year: number; month: number; day: number }, hour: number, minute: number, offsetMinutes: number): Date {
  return new Date(Date.UTC(wall.year, wall.month - 1, wall.day, hour, minute) - offsetMinutes * 60_000);
}

function isoDate(wall: { year: number; month: number; day: number }): string {
  return `${wall.year}-${String(wall.month).padStart(2, "0")}-${String(wall.day).padStart(2, "0")}`;
}

export interface SlotSchedule {
  isoDate: string;
  slot: AiSlot;
  dueAt: Date;
}

/**
 * Next scheduled slot occurrence strictly after `now`, respecting enabled days.
 * When a slot's wall time already passed, it is skipped, so the caller combines
 * this with `missedSlots` to cover catch-up windows.
 */
export function nextSlot(now: Date, settings: Pick<AiAutomationSettingsDTO, "timezone" | "morningTime" | "eveningTime" | "enabledDays">): SlotSchedule | null {
  const offset = zoneOffsetMinutes(settings.timezone);
  const parse = (time: string): { hour: number; minute: number } => {
    const [hour, minute] = settings[time === settings.morningTime ? "morningTime" : "eveningTime"].split(":").map(Number);
    return { hour: Number.isFinite(hour) ? hour : 8, minute: Number.isFinite(minute) ? minute : 0 };
  };
  const enabled = new Set(settings.enabledDays);
  const slots: { time: string; slot: AiSlot }[] = [
    { time: settings.morningTime, slot: "MORNING" },
    { time: settings.eveningTime, slot: "EVENING" },
  ];

  for (let offsetDays = 0; offsetDays <= 14; offsetDays++) {
    const wall = wallParts(new Date(now.getTime() + offsetDays * 86_400_000), offset);
    if (!enabled.has(wall.dayName)) continue;
    for (const { time, slot } of slots) {
      const [hour, minute] = time.split(":").map(Number);
      const candidate = toUtc(wall, hour, minute, offset);
      if (candidate.getTime() > now.getTime()) {
        return { isoDate: isoDate(wall), slot, dueAt: candidate };
      }
    }
  }
  return null;
}

/**
 * Slot instances for the current wall day that are already due and currently
 * within `catchUpWindowMinutes` of their scheduled time. Used because the
 * scheduler runs inside the 60s worker loop and can be suspended during deploys.
 */
export function dueSlots(now: Date, settings: Pick<AiAutomationSettingsDTO, "timezone" | "morningTime" | "eveningTime" | "enabledDays" | "catchUpWindowMinutes">): { isoDate: string; slot: AiSlot; dueAt: Date }[] {
  const offset = zoneOffsetMinutes(settings.timezone);
  const wall = wallParts(now, offset);
  const enabled = new Set(settings.enabledDays);
  if (!enabled.has(wall.dayName)) return [];
  const out: { isoDate: string; slot: AiSlot; dueAt: Date }[] = [];
  for (const [time, slot] of [
    [settings.morningTime, "MORNING"],
    [settings.eveningTime, "EVENING"],
  ] as const) {
    const [hour, minute] = time.split(":").map(Number);
    const dueAt = toUtc(wall, hour, minute, offset);
    if (now.getTime() >= dueAt.getTime() && now.getTime() <= dueAt.getTime() + settings.catchUpWindowMinutes * 60_000) {
      out.push({ isoDate: isoDate(wall), slot, dueAt });
    }
  }
  return out;
}

/** Deterministic 32-bit FNV-1a hash — stable across processes/restarts. */
export function hashValue(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// ── Cost estimation (rough, provider/model aware) ──────────────────────────
// Reference prices per 1M tokens (USD), scales as fallback. Multipliers are the
// author's best-effort approximation and feed budget guardrails, not billing.
const PRICE_PER_MT_INPUT: Record<string, number> = {
  "gpt-4o": 2.5,
  "gpt-4o-mini": 0.15,
  "gpt-4.1": 2.0,
  "o3": 2.0,
  "o4-mini": 1.1,
  "claude-sonnet-4": 3.0,
  "claude-sonnet-4-5": 3.0,
  "claude-3-5-sonnet": 3.0,
  "claude-haiku": 0.8,
  "claude-3-5-haiku": 0.8,
  "grok-3": 2.0,
  "grok-3-mini": 0.6,
  "grok-4": 3.0,
};
const OUTPUT_MULTIPLIER = 5;

export function estimateCostCents(model: string, inputTokens: number, outputTokens: number, options?: { imageCount?: number; textToImage?: boolean }): number {
  const base = PRICE_PER_MT_INPUT[model] ?? 2.0;
  const inputCents = (inputTokens / 1_000_000) * base * 100;
  const outputCents = (outputTokens / 1_000_000) * base * OUTPUT_MULTIPLIER * 100;
  let total = inputCents + outputCents;
  if (options?.textToImage && options.imageCount) {
    total += (options.imageCount ?? 0) * (model.includes("dall-e") ? 4.0 * 100 : 4.5 * 100) / 100;
  }
  return Math.max(1, Math.round(total));
}

// ── Normalized failure helpers ─────────────────────────────────────────────
export interface AiAttemptFailure {
  provider: AiProviderId;
  model: string;
  message: string;
  closed: boolean; // structural / auth — no value retrying a different provider
}

export function classifyTextSuccess(result: TextGenerationResult): boolean {
  return result.content.trim().length > 0;
}