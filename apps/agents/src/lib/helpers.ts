import { createHmac } from "node:crypto";
import {
  AUTH_AUDIENCES,
  SAFETY_TERMS,
  type AgentScope,
} from "@nnact/shared";

const FORBIDDEN_PRICE_KEYS = new Set([
  "price",
  "unitPrice",
  "unitPriceCents",
  "amount",
  "amountCents",
  "total",
  "totalCents",
  "costCents",
  "lowCents",
  "highCents",
  "weightedCents",
]);

export function detectSafety(text: string | null | undefined): string[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  return [...new Set(SAFETY_TERMS.filter((term) => lower.includes(term)))];
}

export function rejectModelPrices(value: unknown, path = "output"): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectModelPrices(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_PRICE_KEYS.has(key)) {
      throw new Error(`model output contained forbidden price field ${path}.${key}`);
    }
    rejectModelPrices(nested, `${path}.${key}`);
  }
}

export function serviceAreaFromAddress(address: string | null): string | null {
  const parts = (address ?? "").split(",").map((part) => part.trim()).filter(Boolean);
  return parts.slice(-2).join(", ") || null;
}

export function quotePrompt(input: {
  job: { title: string; description: string | null; serviceArea: string | null };
  candidates: Array<{
    itemId?: string | null;
    rateId?: string | null;
    kind: string;
    name: string;
    aliases: unknown;
    unit: string | null;
    range: unknown;
  }>;
}): string {
  return JSON.stringify(
    {
      job: input.job,
      instruction: "Select candidate ids and quantities only. Never write a price, total or amount: prices come from the server.",
      candidates: input.candidates.map((candidate) => ({
        candidateId: candidate.itemId ?? candidate.rateId,
        kind: candidate.kind,
        name: candidate.name,
        aliases: candidate.aliases,
        unit: candidate.unit,
        range: candidate.range,
      })),
    },
    null,
    2,
  );
}

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

export interface AgentTokenInput {
  orgId: string;
  agentId: string;
  legacyAgentId: string;
  scopes: AgentScope[];
  secret?: string;
  now?: number;
  ttlSeconds?: number;
}

export function createAgentToken(input: AgentTokenInput): string {
  const secret = input.secret ?? process.env.JWT_SECRET?.trim() ?? "nnactpro-development-only-secret";
  const now = input.now ?? Math.floor(Date.now() / 1000);
  const ttlSeconds = input.ttlSeconds ?? 300;
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      aud: AUTH_AUDIENCES.agent,
      agent_id: input.agentId,
      agentId: input.legacyAgentId,
      orgId: input.orgId,
      scope: input.scopes[0],
      scopes: input.scopes,
      iat: now,
      exp: now + ttlSeconds,
    }),
  );
  const signature = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}
