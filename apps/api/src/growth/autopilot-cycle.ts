// Autopilot observe/assist/autopilot cycle — allocation and campaign proposals.

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  db,
  growthAutopilotDecisions,
  growthAutopilotSettings,
  growthSectors,
} from "@nnact/db";
import { computeSectorAllocations, type SectorAllocationInput } from "./allocation.js";
import { loadSectorMetricsFromDb } from "./autopilot-cycle-metrics.js";
import { isColdSendingEnabled } from "./transport-policy.js";
import { tickGrowthCampaigns } from "./scheduler.js";

export interface AutopilotCycleResult {
  cycleId: string;
  mode: string;
  decisions: number;
  coldBlocked: boolean;
  /** Populated only in AUTOPILOT mode, where the cycle dispatches sends. */
  dispatched: {
    ranCampaigns: number;
    sent: number;
    suppressed: number;
    blocked: number;
    skipped: number;
    failed: number;
  } | null;
  refusals: { campaignId: string; code: string; message: string }[];
  message: string;
}

export async function runAutopilotCycle(orgId: string): Promise<AutopilotCycleResult> {
  const cycleId = randomUUID();
  const [settings] = await db
    .select()
    .from(growthAutopilotSettings)
    .where(eq(growthAutopilotSettings.orgId, orgId))
    .limit(1);

  const mode = settings?.mode ?? "OBSERVE";
  const paused = settings?.paused ?? false;
  const coldReady = isColdSendingEnabled(process.env);

  if (paused) {
    return {
      cycleId,
      mode,
      decisions: 0,
      coldBlocked: !coldReady,
      dispatched: null,
      refusals: [],
      message: "Autopilot is paused; no sends scheduled.",
    };
  }

  const sectors = await db.select().from(growthSectors).where(eq(growthSectors.orgId, orgId));
  const inputs: SectorAllocationInput[] = [];

  for (const sector of sectors) {
    const metrics = await loadSectorMetricsFromDb(orgId, sector.id);
    inputs.push({
      sectorId: sector.id,
      name: sector.name,
      pinned: sector.pinned,
      excluded: sector.excluded,
      paused: sector.paused,
      manualOverride: sector.manualAllocationOverride,
      contacts: metrics.contacts,
      minSampleSize: sector.minSampleSize,
      observationDays: sector.observationDays,
      daysObserved: metrics.daysObserved,
      qualifiedMeetings: metrics.meetings,
      assessments: metrics.assessments,
      acceptedEstimates: metrics.estimates,
      wonRevenueCents: metrics.wonRevenueCents,
      positiveReplies: metrics.positiveReplies,
      objections: metrics.objections,
      unsubscribes: metrics.unsubscribes,
      bounces: metrics.bounces,
      complaints: metrics.complaints,
      currentWeight: sector.allocationWeight,
    });
  }

  const dailyCap = settings?.dailySendCap ?? 50;
  const exploration = settings?.explorationPercent ?? 20;
  const allocations = computeSectorAllocations(inputs, { dailyCapacity: dailyCap, explorationPercent: exploration });

  let decisions = 0;
  for (const row of allocations) {
    if (row.newAllocation === row.previousAllocation) continue;
    await db.insert(growthAutopilotDecisions).values({
      orgId,
      sectorId: row.sectorId,
      cycleId,
      previousAllocation: row.previousAllocation,
      newAllocation: row.newAllocation,
      reasoning: row.reasoning,
      inputs: { dailyCap, exploration, coldTransportReady: coldReady, mode },
    });
    await db
      .update(growthSectors)
      .set({ allocationWeight: row.newAllocation, updatedAt: new Date() })
      .where(and(eq(growthSectors.orgId, orgId), eq(growthSectors.id, row.sectorId)));
    decisions += 1;
  }

  await db
    .update(growthAutopilotSettings)
    .set({ lastCycleAt: new Date(), updatedAt: new Date() })
    .where(eq(growthAutopilotSettings.orgId, orgId));

  if (mode === "OBSERVE") {
    return {
      cycleId,
      mode,
      decisions,
      coldBlocked: !coldReady,
      dispatched: null,
      refusals: [],
      message: "Observe mode: recommendations recorded; no campaigns scheduled.",
    };
  }

  if (mode === "ASSISTED") {
    return {
      cycleId,
      mode,
      decisions,
      coldBlocked: !coldReady,
      dispatched: null,
      refusals: [],
      message: "Assisted mode: allocations recorded for review; a person starts each campaign.",
    };
  }

  // AUTOPILOT. This is the mode whose entire promise is that allocation
  // decisions turn into sends, and it previously only wrote weights to the
  // database. Dispatch through the same scheduler tick the background worker
  // uses, so there is exactly one send implementation and one set of guards:
  // the org daily cap, the sector share, per-campaign daily limits, quiet hours,
  // suppression and the advisory lock all apply unchanged.
  if (!coldReady) {
    return {
      cycleId,
      mode,
      decisions,
      coldBlocked: true,
      dispatched: null,
      refusals: [],
      message: "Allocation updated, but cold campaigns cannot activate until cold transport is configured.",
    };
  }

  const tick = await tickGrowthCampaigns({ now: new Date() });
  return {
    cycleId,
    mode,
    decisions,
    coldBlocked: !coldReady,
    dispatched: {
      ranCampaigns: tick.ranCampaigns,
      sent: tick.sent,
      suppressed: tick.suppressed,
      blocked: tick.blocked,
      skipped: tick.skipped,
      failed: tick.failed,
    },
    refusals: tick.refusals,
    message:
      tick.sent > 0
        ? `Autopilot cycle completed: ${tick.sent} sent across ${tick.ranCampaigns} campaign(s).`
        : tick.refusals.length > 0
          ? `Autopilot cycle completed with no sends; ${tick.refusals.length} campaign(s) refused (${tick.refusals
              .map((r) => r.code)
              .slice(0, 3)
              .join(", ")}).`
          : "Autopilot cycle completed; no campaign had a send due right now.",
  };
}
