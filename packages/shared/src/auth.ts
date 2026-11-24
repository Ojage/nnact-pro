import type { AgentId as CanonicalAgentId } from "./agent-registry.js";

export const AUTH_AUDIENCES = {
  staff: "staff",
  customer: "customer",
  agent: "agent",
} as const;

export type AuthAudience = (typeof AUTH_AUDIENCES)[keyof typeof AUTH_AUDIENCES];

export interface StaffSessionUser {
  id: string;
  name: string;
  email: string;
  role: string;
  orgId: string;
  mustChangePassword?: boolean;
}

/**
 * Narrow service identity. Agent tokens are accepted only on agent endpoints;
 * `isStaffClaims` deliberately rejects them, so adding this audience does not
 * grant access to any existing staff route.
 */
export const AGENT_SCOPES = {
  draftJobsCreate: "draft-jobs:create",
  jobsRead: "jobs:read",
  techniciansRead: "technicians:read",
  dispatchSuggestionsCreate: "dispatch-suggestions:create",
  priceBookRead: "price-book:read",
  quoteProposalsCreate: "quote-proposals:create",
  messagesRead: "messages:read",
  messagesWrite: "messages:write",
  conversationsRead: "conversations:read",
  conversationsWrite: "conversations:write",
  whatsappTemplatedSend: "whatsapp:templated-send",
  priceObservationsCreate: "price-observations:create",
  sourcingSuggestionsCreate: "sourcing-suggestions:create",
  supplierMessagesTemplatedSend: "supplier-messages:templated-send",
  invoicesRead: "invoices:read",
  paymentRemindersSend: "payment-reminders:send",
  agentRunsWrite: "agent-runs:write",
} as const;

export type AgentScope = (typeof AGENT_SCOPES)[keyof typeof AGENT_SCOPES];

export interface AgentJwtClaims {
  aud: typeof AUTH_AUDIENCES.agent;
  agent_id?: CanonicalAgentId;
  agentId?: string;
  orgId: string;
  /** Primary scope; kept for the original single-scope Intake token. */
  scope: AgentScope;
  /** All scopes granted to this token; quoting needs three at once. */
  scopes?: AgentScope[];
}

const AGENT_SCOPE_VALUES = Object.values(AGENT_SCOPES) as string[];

// Must match each agent's scopes in AGENT_REGISTRY; test/agent-registry.test.mjs
// fails if the two drift. (A value import of the registry here would break the
// package's tsx-free test run.)
const AGENT_CLAIM_SCOPE_GRANTS: Record<string, readonly AgentScope[]> = {
  "intake-agent": [
    AGENT_SCOPES.draftJobsCreate,
    AGENT_SCOPES.messagesRead,
    AGENT_SCOPES.messagesWrite,
    AGENT_SCOPES.conversationsRead,
    AGENT_SCOPES.conversationsWrite,
    AGENT_SCOPES.whatsappTemplatedSend,
    AGENT_SCOPES.agentRunsWrite,
  ],
  "quoting-agent": [
    AGENT_SCOPES.jobsRead,
    AGENT_SCOPES.priceBookRead,
    AGENT_SCOPES.quoteProposalsCreate,
    AGENT_SCOPES.agentRunsWrite,
  ],
  "dispatch-agent": [
    AGENT_SCOPES.jobsRead,
    AGENT_SCOPES.techniciansRead,
    AGENT_SCOPES.dispatchSuggestionsCreate,
    AGENT_SCOPES.agentRunsWrite,
  ],
  "pricebook-agent": [AGENT_SCOPES.priceBookRead, AGENT_SCOPES.priceObservationsCreate, AGENT_SCOPES.agentRunsWrite],
  "triage-agent": [AGENT_SCOPES.jobsRead, AGENT_SCOPES.agentRunsWrite],
  "sourcing-agent": [
    AGENT_SCOPES.priceBookRead,
    AGENT_SCOPES.sourcingSuggestionsCreate,
    AGENT_SCOPES.supplierMessagesTemplatedSend,
    AGENT_SCOPES.agentRunsWrite,
  ],
  "copilot-agent": [AGENT_SCOPES.jobsRead, AGENT_SCOPES.messagesRead, AGENT_SCOPES.conversationsRead, AGENT_SCOPES.agentRunsWrite],
  "payments-agent": [AGENT_SCOPES.jobsRead, AGENT_SCOPES.invoicesRead, AGENT_SCOPES.paymentRemindersSend, AGENT_SCOPES.agentRunsWrite],
};

function isAgentScope(value: unknown): value is AgentScope {
  return typeof value === "string" && AGENT_SCOPE_VALUES.includes(value);
}

function resolveClaimAgentId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (Object.hasOwn(AGENT_CLAIM_SCOPE_GRANTS, trimmed)) return trimmed;
  const canonical = trimmed.startsWith("nnact-") ? trimmed.slice("nnact-".length) : trimmed;
  return Object.hasOwn(AGENT_CLAIM_SCOPE_GRANTS, canonical) ? canonical : null;
}

function claimAgentScopeAllowed(agentId: string, scope: AgentScope): boolean {
  return AGENT_CLAIM_SCOPE_GRANTS[agentId]?.includes(scope) ?? false;
}

function resolveClaimIds(candidate: { agent_id?: unknown; agentId?: unknown }): string | null {
  if (candidate.agent_id === undefined && candidate.agentId === undefined) return null;
  const canonical = resolveClaimAgentId(candidate.agent_id);
  const alias = resolveClaimAgentId(candidate.agentId);
  if (candidate.agent_id !== undefined && !canonical) return null;
  if (candidate.agentId !== undefined && !alias) return null;
  if (canonical && alias && canonical !== alias) return null;
  return canonical ?? alias;
}

export function isAgentClaims(claims: unknown): claims is AgentJwtClaims {
  if (!claims || typeof claims !== "object") return false;
  const candidate = claims as {
    aud?: unknown;
    agent_id?: unknown;
    agentId?: unknown;
    orgId?: unknown;
    scope?: unknown;
    scopes?: unknown;
  };
  if (candidate.aud !== AUTH_AUDIENCES.agent || typeof candidate.orgId !== "string") return false;
  const agentId = resolveClaimIds(candidate);
  if (!agentId || !isAgentScope(candidate.scope) || !claimAgentScopeAllowed(agentId, candidate.scope)) return false;
  if (candidate.scopes === undefined) return true;
  return (
    Array.isArray(candidate.scopes) &&
    candidate.scopes.every((scope) => isAgentScope(scope) && claimAgentScopeAllowed(agentId, scope))
  );
}

export function hasAgentScope(claims: AgentJwtClaims, scope: AgentScope): boolean {
  return (claims.scopes ?? [claims.scope]).includes(scope);
}

export function requireAgentScope(
  claims: unknown,
  expectedAgentId: CanonicalAgentId | string,
  scope: AgentScope | string,
): claims is AgentJwtClaims {
  if (!isAgentClaims(claims)) return false;
  const expected = resolveClaimAgentId(expectedAgentId);
  if (!expected || !isAgentScope(scope) || !claimAgentScopeAllowed(expected, scope)) return false;
  const candidate = claims as { agent_id?: unknown; agentId?: unknown };
  return resolveClaimIds(candidate) === expected && hasAgentScope(claims, scope);
}

export interface CustomerSessionUser {
  id: string;
  name: string;
  email: string;
}

export interface CustomerOrgLinkDTO {
  orgId: string;
  orgName: string;
  customerId: string;
  linkedVia: string;
}

export interface AuthTokenPairDTO {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface StaffAuthResponseDTO extends AuthTokenPairDTO {
  user: StaffSessionUser;
  mustChangePassword?: boolean;
}

export interface CustomerAuthResponseDTO extends AuthTokenPairDTO {
  user: CustomerSessionUser;
  orgs: CustomerOrgLinkDTO[];
}

export const PASSWORD_MIN_LENGTH = 12;

export function validatePasswordStrength(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return "Password must include at least one letter and one number.";
  }
  return null;
}
