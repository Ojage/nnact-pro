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
} as const;

export type AgentScope = (typeof AGENT_SCOPES)[keyof typeof AGENT_SCOPES];

export interface AgentJwtClaims {
  aud: typeof AUTH_AUDIENCES.agent;
  agentId: string;
  orgId: string;
  /** Primary scope; kept for the original single-scope Intake token. */
  scope: AgentScope;
  /** All scopes granted to this token; quoting needs three at once. */
  scopes?: AgentScope[];
}

const AGENT_SCOPE_VALUES = Object.values(AGENT_SCOPES) as string[];

export function isAgentClaims(claims: unknown): claims is AgentJwtClaims {
  if (
    !claims ||
    typeof claims !== "object" ||
    (claims as { aud?: unknown }).aud !== AUTH_AUDIENCES.agent ||
    typeof (claims as { agentId?: unknown }).agentId !== "string" ||
    typeof (claims as { orgId?: unknown }).orgId !== "string" ||
    !AGENT_SCOPE_VALUES.includes((claims as { scope?: unknown }).scope as string)
  ) {
    return false;
  }
  const scopes = (claims as { scopes?: unknown }).scopes;
  return scopes === undefined || (Array.isArray(scopes) && scopes.every((scope) => AGENT_SCOPE_VALUES.includes(scope as string)));
}

export function hasAgentScope(claims: AgentJwtClaims, scope: AgentScope): boolean {
  return (claims.scopes ?? [claims.scope]).includes(scope);
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
