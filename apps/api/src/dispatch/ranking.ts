import { createHash } from "node:crypto";
import type {
  DispatchCandidate,
  DispatchEligibleJob,
  DispatchRankedCandidate,
  DispatchReasonsOutput,
  DispatchRankingInput,
  DispatchRankingTechnician,
  DispatchScoreFactor,
} from "@nnact/shared";

const normalize = (value: string | null | undefined): string =>
  value
    ?.toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim() ?? "";

const hasSkill = (technician: DispatchRankingTechnician, hint: string): boolean => {
  const wanted = normalize(hint);
  if (!wanted) return false;
  return technician.skills.some((skill) => {
    const actual = normalize(skill);
    return actual === wanted || actual.includes(wanted) || wanted.includes(actual);
  });
};

const areaFactor = (job: DispatchEligibleJob, technician: DispatchRankingTechnician): DispatchScoreFactor | null => {
  const home = normalize(technician.homeArea);
  if (!home) return null;

  const zone = normalize(job.zone);
  if (zone && zone === home) {
    return { key: "area", label: "Works your zone", points: 25, detail: `Home area matches ${job.zone}.` };
  }

  const neighborhood = normalize(job.neighborhood);
  if (neighborhood && neighborhood === home) {
    return { key: "area", label: "Knows your neighborhood", points: 18, detail: `Home area matches ${job.neighborhood}.` };
  }

  const town = normalize(job.town);
  if (town && town === home) {
    return { key: "area", label: "Based in your town", points: 12, detail: `Home area matches ${job.town}.` };
  }

  const address = normalize(job.serviceAddress);
  if (address && address.includes(home)) {
    return { key: "area", label: "Near the job site", points: 8, detail: "Home area appears in the service address." };
  }

  return null;
};

const scoreTechnician = (job: DispatchEligibleJob, technician: DispatchRankingTechnician): DispatchCandidate | null => {
  if (technician.hasConflict) return null;
  if (technician.todayVisits >= technician.maxDailyVisits) return null;

  const missingSkill = job.skillHints.map(normalize).find((hint) => hint && !hasSkill(technician, hint));
  if (missingSkill) return null;

  const factors: DispatchScoreFactor[] = [];
  const area = areaFactor(job, technician);
  if (area) factors.push(area);

  const headroom = Math.max(0, technician.maxDailyVisits - technician.todayVisits) / technician.maxDailyVisits;
  factors.push({
    key: "availability",
    label: "Has visit capacity",
    points: Math.min(15, Math.round(headroom * 15)),
    detail: `${technician.todayVisits}/${technician.maxDailyVisits} visits already scheduled.`,
  });

  if (technician.completedSameCategory > 0) {
    factors.push({
      key: "category",
      label: "Relevant repair history",
      points: Math.min(15, technician.completedSameCategory * 3),
      detail: `${technician.completedSameCategory} completed ${job.serviceCategory ?? "similar"} jobs.`,
    });
  }

  if (technician.priorCustomerVisits > 0) {
    factors.push({
      key: "continuity",
      label: "Knows this customer",
      points: Math.min(12, technician.priorCustomerVisits * 4),
      detail: `${technician.priorCustomerVisits} prior visits for this customer.`,
    });
  }

  if (technician.outcomeQualityScore !== null) {
    factors.push({
      key: "quality",
      label: "Repair outcome quality",
      points: Math.round((technician.outcomeQualityScore - 0.5) * 10),
      detail: `Outcome quality score ${technician.outcomeQualityScore.toFixed(2)}.`,
    });
  }

  if (technician.outcomeFailureCount > 0) {
    factors.push({
      key: "failures",
      label: "Recent failed attempts",
      points: -Math.min(9, technician.outcomeFailureCount * 3),
      detail: `${technician.outcomeFailureCount} failed attempts on record.`,
    });
  }

  const score = Math.max(0, factors.reduce((sum, factor) => sum + factor.points, 0));
  const evidence = factors.filter((factor) => factor.points > 0).length;
  const confidence = Math.min(0.96, 0.5 + score / 200 + evidence * 0.04);

  return {
    technicianId: technician.technicianId,
    name: technician.name,
    rank: 0,
    score,
    confidence,
    factors,
    reasons: factors
      .filter((factor) => factor.points > 0)
      .sort((a, b) => b.points - a.points)
      .slice(0, 2)
      .map((factor) => factor.detail),
  };
};

export function buildDispatchJobFingerprint(job: DispatchEligibleJob): string {
  const payload = {
    jobId: job.jobId,
    orgId: job.orgId,
    scheduledAt: job.scheduledAt,
    serviceCategory: normalize(job.serviceCategory),
    serviceAddress: normalize(job.serviceAddress),
    town: normalize(job.town),
    neighborhood: normalize(job.neighborhood),
    landmark: normalize(job.landmark),
    zone: normalize(job.zone),
    customerId: job.customerId,
    skillHints: job.skillHints.map(normalize).sort(),
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 32);
}

export function rankDispatchTechnicians(input: DispatchRankingInput): {
  candidates: DispatchCandidate[];
  causes: string[];
} {
  const causes: string[] = [];
  const candidates: DispatchCandidate[] = [];

  for (const technician of input.technicians) {
    if (technician.hasConflict) {
      causes.push(`${technician.name} is already booked for the visit window.`);
      continue;
    }
    if (technician.todayVisits >= technician.maxDailyVisits) {
      causes.push(`${technician.name} is at the daily visit cap (${technician.todayVisits}/${technician.maxDailyVisits}).`);
      continue;
    }
    const missingSkill = input.job.skillHints.map(normalize).find((hint) => hint && !hasSkill(technician, hint));
    if (missingSkill) {
      causes.push(`${technician.name} lacks the required ${missingSkill} skill.`);
      continue;
    }
    const scored = scoreTechnician(input.job, technician);
    if (scored) candidates.push(scored);
  }

  candidates.sort((a, b) => b.score - a.score || a.technicianId.localeCompare(b.technicianId));
  const ranked = candidates.slice(0, 3).map((candidate, index) => ({ ...candidate, rank: index + 1 }));

  if (ranked.length === 0) {
    causes.unshift("No available technician passed the hard constraints for this job.");
  }

  return { candidates: ranked, causes: causes.slice(0, 5) };
}

export function applyDispatchReasons(
  candidates: DispatchCandidate[],
  output: DispatchReasonsOutput | null,
): DispatchRankedCandidate[] {
  const allowedIds = new Set(candidates.map((candidate) => candidate.technicianId));
  const modelReasons = new Map<string, string>();
  for (const reason of output?.reasons ?? []) {
    if (allowedIds.has(reason.technicianId) && reason.reason.trim()) {
      modelReasons.set(reason.technicianId, reason.reason.trim());
    }
  }

  return candidates.map((candidate) => {
    const reason = modelReasons.get(candidate.technicianId);
    return {
      ...candidate,
      reasons: reason ? [reason] : candidate.reasons,
      reasonSource: reason ? "model" : "fallback",
    };
  });
}
