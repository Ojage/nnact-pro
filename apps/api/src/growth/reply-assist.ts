// AI-assisted reply routing — identity verification and commitments go to humans.

import type { GrowthReplyIntent } from "@nnact/shared";

export interface ReplyClassification {
  intent: GrowthReplyIntent;
  requiresHuman: boolean;
  humanRouteReason?: string;
  verificationRequested: boolean;
}

const VERIFICATION_PATTERNS =
  /\b(do you work|are you (really|actually)|employed at|from nnact|who are you|is this legitimate|verify|scam)\b/i;

const PRICING_PATTERNS = /\b(price|pricing|quote|cost|how much|tarif|prix|devis)\b/i;
const SCHEDULING_PATTERNS = /\b(schedule|visit|assessment|site survey|meet|appointment|rendez-vous|visite)\b/i;
const UNSUB_PATTERNS = /\b(unsubscribe|opt out|remove me|stop emailing|don't contact|ne plus)\b/i;
const COMPLAINT_PATTERNS = /\b(complaint|unacceptable|lawyer|legal|harass|spam report)\b/i;

export function classifyInboundReply(body: string): ReplyClassification {
  const text = body.trim();
  if (VERIFICATION_PATTERNS.test(text)) {
    return {
      intent: "VERIFICATION",
      requiresHuman: true,
      humanRouteReason: "Prospect asked to verify sender identity or employment at NNACT.",
      verificationRequested: true,
    };
  }
  if (UNSUB_PATTERNS.test(text)) {
    return { intent: "UNSUBSCRIBE", requiresHuman: true, humanRouteReason: "Opt-out must be handled by a person.", verificationRequested: false };
  }
  if (COMPLAINT_PATTERNS.test(text)) {
    return { intent: "COMPLAINT", requiresHuman: true, humanRouteReason: "Sensitive complaint — human response required.", verificationRequested: false };
  }
  if (PRICING_PATTERNS.test(text)) {
    return {
      intent: "PRICING",
      requiresHuman: true,
      humanRouteReason: "Pricing commitments require human approval against approved knowledge.",
      verificationRequested: false,
    };
  }
  if (SCHEDULING_PATTERNS.test(text)) {
    return { intent: "SCHEDULING", requiresHuman: false, verificationRequested: false };
  }
  if (/\b(not interested|no thank|pass for now|pas intéress)\b/i.test(text)) {
    return { intent: "NOT_INTERESTED", requiresHuman: false, verificationRequested: false };
  }
  if (/\b(out of office|automatic reply|auto-reply|away from)\b/i.test(text)) {
    return { intent: "AUTO_REPLY", requiresHuman: false, verificationRequested: false };
  }
  if (/\b(interested|tell me more|sounds good|yes please|intéressé)\b/i.test(text)) {
    return { intent: "INTERESTED", requiresHuman: false, verificationRequested: false };
  }
  return { intent: "OTHER", requiresHuman: false, verificationRequested: false };
}

/** Draft prompt guard: never invent an employee name. */
export const REPLY_DRAFT_SYSTEM = `You draft email replies for NNACT outreach staff. Rules:
- Use only approved company facts provided in context; do not invent credentials, prices, or guarantees.
- Never invent an NNACT employee name or title. Refer to the real sender identity supplied in context.
- Write in the requested language (English or French).
- If facts are missing, say you will confirm rather than guessing.
- Keep replies concise and professional.`;
