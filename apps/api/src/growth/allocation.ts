// Autopilot sector allocation — statistically cautious, not reply-count chasing.

export interface SectorAllocationInput {
  sectorId: string;
  name: string;
  pinned: boolean;
  excluded: boolean;
  paused: boolean;
  manualOverride?: number | null;
  /** Contacts attempted in the observation window. */
  contacts: number;
  minSampleSize: number;
  observationDays: number;
  daysObserved: number;
  qualifiedMeetings: number;
  assessments: number;
  acceptedEstimates: number;
  wonRevenueCents: number;
  positiveReplies: number;
  objections: number;
  unsubscribes: number;
  bounces: number;
  complaints: number;
  currentWeight: number;
}

export interface SectorAllocationResult {
  sectorId: string;
  previousAllocation: number;
  newAllocation: number;
  reasoning: string;
}

export interface AllocationOptions {
  dailyCapacity: number;
  explorationPercent: number;
}

function scoreSector(input: SectorAllocationInput): number {
  if (input.excluded || input.paused) return 0;
  if (input.manualOverride != null) return Math.max(0, input.manualOverride);

  const sampleReady =
    input.contacts >= input.minSampleSize && input.daysObserved >= input.observationDays;
  if (!sampleReady) {
    // Exploration floor: new sectors get a modest share until sample matures.
    return 10 + Math.min(input.contacts, 5);
  }

  let score =
    input.qualifiedMeetings * 40 +
    input.assessments * 25 +
    input.acceptedEstimates * 30 +
    input.positiveReplies * 8 +
    Math.min(input.wonRevenueCents / 10_000, 50);

  score -= input.objections * 4;
  score -= input.unsubscribes * 15;
  score -= input.bounces * 10;
  score -= input.complaints * 25;

  if (input.contacts > 0 && input.qualifiedMeetings === 0 && input.positiveReplies > 3) {
    // Many replies but no meetings — downweight (banks vs hotels scenario).
    score *= 0.5;
  }

  return Math.max(0, score);
}

/**
 * Distributes `dailyCapacity` across sectors. Reserves `explorationPercent` for
 * sectors that have not reached minimum sample, caps any single sector at 45%.
 */
export function computeSectorAllocations(
  sectors: SectorAllocationInput[],
  options: AllocationOptions,
): SectorAllocationResult[] {
  const capacity = Math.max(1, options.dailyCapacity);
  const explorationBudget = Math.floor((capacity * Math.min(50, Math.max(0, options.explorationPercent))) / 100);
  const mainBudget = capacity - explorationBudget;

  const scored = sectors.map((s) => ({
    input: s,
    score: scoreSector(s),
    sampleReady: s.contacts >= s.minSampleSize && s.daysObserved >= s.observationDays,
  }));

  const eligible = scored.filter((s) => s.score > 0 || s.input.pinned);
  const totalScore = eligible.reduce((sum, s) => sum + (s.input.pinned ? Math.max(s.score, 20) : s.score), 0);

  const results: SectorAllocationResult[] = [];

  for (const row of sectors) {
    const previous = row.currentWeight;
    if (row.excluded || row.paused) {
      results.push({
        sectorId: row.sectorId,
        previousAllocation: previous,
        newAllocation: 0,
        reasoning: `${row.name} is ${row.excluded ? "excluded" : "paused"} by an administrator; allocation set to zero.`,
      });
      continue;
    }

    if (row.manualOverride != null) {
      results.push({
        sectorId: row.sectorId,
        previousAllocation: previous,
        newAllocation: row.manualOverride,
        reasoning: `${row.name} uses a manual allocation override of ${row.manualOverride} set by an administrator.`,
      });
      continue;
    }

    const match = scored.find((s) => s.input.sectorId === row.sectorId)!;
    const sampleReady = match.sampleReady;

    let share = 0;
    if (match.input.pinned) {
      share = Math.max(15, Math.min(45, (match.score / Math.max(totalScore, 1)) * mainBudget));
    } else if (!sampleReady) {
      const immature = scored.filter((s) => !s.sampleReady && !s.input.excluded && !s.input.paused);
      share = immature.length ? explorationBudget / immature.length : 0;
    } else if (totalScore > 0) {
      share = (match.score / totalScore) * mainBudget;
      share = Math.min(share, capacity * 0.45);
    }

    const rounded = Math.round(share);
    const reasoning = buildReasoning(row, sampleReady, rounded, capacity);
    results.push({
      sectorId: row.sectorId,
      previousAllocation: previous,
      newAllocation: rounded,
      reasoning,
    });
  }

  return results;
}

function buildReasoning(input: SectorAllocationInput, sampleReady: boolean, allocation: number, capacity: number): string {
  if (!sampleReady) {
    return (
      `${input.name} has not reached the minimum sample (${input.contacts}/${input.minSampleSize} contacts, ` +
      `${input.daysObserved}/${input.observationDays} days observed). ` +
      `Autopilot keeps a small exploration allowance (${allocation} of ${capacity} daily capacity) rather than scaling on early replies.`
    );
  }
  if (input.qualifiedMeetings > 0 && input.positiveReplies > input.qualifiedMeetings) {
    return (
      `${input.name} produced ${input.qualifiedMeetings} qualified meeting(s) and ${input.assessments} assessment(s) ` +
      `from ${input.contacts} contacts. Positive replies weighed less than downstream outcomes, so allocation is ${allocation}. ` +
      `More effort would reverse if meetings stall while complaints or opt-outs rise.`
    );
  }
  if (input.positiveReplies > 2 && input.qualifiedMeetings === 0) {
    return (
      `${input.name} saw ${input.positiveReplies} positive replies but no qualified meetings yet from ${input.contacts} contacts. ` +
      `Reply volume alone does not increase allocation (${allocation}); Autopilot waits for assessments or meetings.`
    );
  }
  return (
    `${input.name}: ${input.contacts} contacts, ${input.qualifiedMeetings} meetings, ${input.assessments} assessments, ` +
    `${input.unsubscribes} opt-outs. Allocation ${allocation} reflects downstream outcomes, not raw reply count.`
  );
}
