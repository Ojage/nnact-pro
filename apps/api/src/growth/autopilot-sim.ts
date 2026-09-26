import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, growthAutopilotSimulationRuns, growthSectors } from "@nnact/db";
import { computeSectorAllocations, type SectorAllocationInput } from "./allocation.js";
import { loadSectorMetricsFromDb } from "./autopilot-cycle-metrics.js";

export async function runAutopilotSimulation(orgId: string, userId: string | null, dailyCapacity = 50) {
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
      minSampleSize: sector.minSampleSize,
      observationDays: sector.observationDays,
      contacts: metrics.contacts,
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

  const raw = computeSectorAllocations(inputs, { dailyCapacity, explorationPercent: 20 });
  const allocations = raw.map((a) => ({
    ...a,
    name: inputs.find((i) => i.sectorId === a.sectorId)?.name ?? a.sectorId,
  }));
  const summary =
    allocations
      .filter((a) => a.newAllocation !== a.previousAllocation)
      .map((a) => `${a.reasoning}`)
      .join(" ") ||
    "Simulation complete: no allocation changes recommended with current evidence.";

  const outputs = { allocations, dailyCapacity, mode: "SIMULATION" };
  const [row] = await db
    .insert(growthAutopilotSimulationRuns)
    .values({
      orgId,
      inputs: { sectors: inputs.length, dailyCapacity },
      outputs,
      summary,
      createdBy: userId,
    })
    .returning();

  return { simulationId: row!.id, cycleId: randomUUID(), summary, allocations, outputs };
}
