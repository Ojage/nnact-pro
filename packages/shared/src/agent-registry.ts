export const AGENT_SCOPES = {
  draftJobsCreate: "draft-jobs:create",
  jobsRead: "jobs:read",
  techniciansRead: "technicians:read",
  dispatchSuggestionsCreate: "dispatch-suggestions:create",
  triageSuggestionsCreate: "triage-suggestions:create",
  copilotSuggestionsCreate: "copilot-suggestions:create",
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

export const AGENT_ID = {
  intake: "intake-agent",
  quoting: "quoting-agent",
  dispatch: "dispatch-agent",
  pricebook: "pricebook-agent",
  triage: "triage-agent",
  sourcing: "sourcing-agent",
  copilot: "copilot-agent",
  payments: "payments-agent",
} as const;

export type AgentId = (typeof AGENT_ID)[keyof typeof AGENT_ID];

export const AGENT_IDS = Object.values(AGENT_ID) as AgentId[];

export const AGENT_AUTONOMY_TIERS = {
  T0: "T0",
  T1: "T1",
  T2: "T2",
  T3: "T3",
} as const;

export type AgentAutonomyTier = (typeof AGENT_AUTONOMY_TIERS)[keyof typeof AGENT_AUTONOMY_TIERS];

/** Delivery stage. Only `live` agents run; the others are shown as vacant offices. */
export const AGENT_STAGES = ["live", "building", "planned"] as const;

export type AgentStage = (typeof AGENT_STAGES)[number];

interface AgentDefinitionInput {
  id: AgentId;
  displayName: string;
  scopes: readonly AgentScope[];
  tier: AgentAutonomyTier;
  taskLabels: readonly string[];
  costCapEnv: string;
  featureFlagKey: string;
  never: readonly string[];
  stage: AgentStage;
}

export interface AgentDefinition extends AgentDefinitionInput {
  autonomyTier: AgentAutonomyTier;
  tasks: readonly string[];
  neverList: readonly string[];
}

function defineAgent(input: AgentDefinitionInput): AgentDefinition {
  return { ...input, autonomyTier: input.tier, tasks: input.taskLabels, neverList: input.never };
}

export const AGENT_REGISTRY: Record<AgentId, AgentDefinition> = {
  [AGENT_ID.intake]: defineAgent({
    id: AGENT_ID.intake,
    displayName: "Intake agent",
    scopes: [
      AGENT_SCOPES.draftJobsCreate,
      AGENT_SCOPES.messagesRead,
      AGENT_SCOPES.messagesWrite,
      AGENT_SCOPES.conversationsRead,
      AGENT_SCOPES.conversationsWrite,
      AGENT_SCOPES.whatsappTemplatedSend,
      AGENT_SCOPES.agentRunsWrite,
    ],
    tier: AGENT_AUTONOMY_TIERS.T3,
    taskLabels: ["agent.extract", "agent.stt", "agent.followup"],
    costCapEnv: "AGENT_DAILY_COST_CAP_CENTS",
    featureFlagKey: "agents.intake.enabled",
    stage: "live",
    never: ["confirm-price", "send-estimate", "assign-job", "accept-payment", "free-form-customer-replies"],
  }),
  [AGENT_ID.quoting]: defineAgent({
    id: AGENT_ID.quoting,
    displayName: "Quoting agent",
    scopes: [
      AGENT_SCOPES.jobsRead,
      AGENT_SCOPES.priceBookRead,
      AGENT_SCOPES.quoteProposalsCreate,
      AGENT_SCOPES.agentRunsWrite,
    ],
    tier: AGENT_AUTONOMY_TIERS.T1,
    taskLabels: ["agent.quote", "agent.receipt_vision"],
    costCapEnv: "QUOTE_AGENT_DAILY_COST_CAP_CENTS",
    featureFlagKey: "agents.quoting.enabled",
    stage: "live",
    never: ["confirm-price", "send-estimate", "collect-payment"],
  }),
  [AGENT_ID.dispatch]: defineAgent({
    id: AGENT_ID.dispatch,
    displayName: "Dispatch agent",
    scopes: [
      AGENT_SCOPES.jobsRead,
      AGENT_SCOPES.techniciansRead,
      AGENT_SCOPES.dispatchSuggestionsCreate,
      AGENT_SCOPES.agentRunsWrite,
    ],
    tier: AGENT_AUTONOMY_TIERS.T1,
    taskLabels: ["agent.dispatch"],
    costCapEnv: "DISPATCH_AGENT_DAILY_COST_CAP_CENTS",
    featureFlagKey: "agents.dispatch.enabled",
    stage: "live",
    never: ["assign-job", "send-estimate", "message-customer"],
  }),
  [AGENT_ID.pricebook]: defineAgent({
    id: AGENT_ID.pricebook,
    displayName: "Price book agent",
    scopes: [AGENT_SCOPES.priceBookRead, AGENT_SCOPES.priceObservationsCreate, AGENT_SCOPES.agentRunsWrite],
    tier: AGENT_AUTONOMY_TIERS.T1,
    taskLabels: ["agent.price_observation"],
    costCapEnv: "PRICEBOOK_AGENT_DAILY_COST_CAP_CENTS",
    featureFlagKey: "agents.pricebook.enabled",
    stage: "live",
    never: ["confirm-price", "send-estimate", "edit-price-book"],
  }),
  [AGENT_ID.triage]: defineAgent({
    id: AGENT_ID.triage,
    displayName: "Triage agent",
    scopes: [AGENT_SCOPES.jobsRead, AGENT_SCOPES.triageSuggestionsCreate, AGENT_SCOPES.agentRunsWrite],
    tier: AGENT_AUTONOMY_TIERS.T1,
    taskLabels: ["agent.triage"],
    costCapEnv: "TRIAGE_AGENT_DAILY_COST_CAP_CENTS",
    featureFlagKey: "agents.triage.enabled",
    stage: "live",
    never: ["confirm-price", "message-customer", "change-record"],
  }),
  [AGENT_ID.sourcing]: defineAgent({
    id: AGENT_ID.sourcing,
    displayName: "Sourcing agent",
    scopes: [
      AGENT_SCOPES.priceBookRead,
      AGENT_SCOPES.sourcingSuggestionsCreate,
      AGENT_SCOPES.supplierMessagesTemplatedSend,
      AGENT_SCOPES.agentRunsWrite,
    ],
    tier: AGENT_AUTONOMY_TIERS.T3,
    taskLabels: ["agent.sourcing", "agent.supplier_message"],
    costCapEnv: "SOURCING_AGENT_DAILY_COST_CAP_CENTS",
    featureFlagKey: "agents.sourcing.enabled",
    stage: "live",
    never: ["place-order", "confirm-price", "message-customer"],
  }),
  [AGENT_ID.copilot]: defineAgent({
    id: AGENT_ID.copilot,
    displayName: "Copilot agent",
    scopes: [
      AGENT_SCOPES.jobsRead,
      AGENT_SCOPES.messagesRead,
      AGENT_SCOPES.conversationsRead,
      AGENT_SCOPES.copilotSuggestionsCreate,
      AGENT_SCOPES.agentRunsWrite,
    ],
    tier: AGENT_AUTONOMY_TIERS.T2,
    taskLabels: ["agent.copilot_suggestion"],
    costCapEnv: "COPILOT_AGENT_DAILY_COST_CAP_CENTS",
    featureFlagKey: "agents.copilot.enabled",
    stage: "live",
    never: ["send-message", "assign-job", "change-record"],
  }),
  [AGENT_ID.payments]: defineAgent({
    id: AGENT_ID.payments,
    displayName: "Payments agent",
    scopes: [
      AGENT_SCOPES.jobsRead,
      AGENT_SCOPES.invoicesRead,
      AGENT_SCOPES.paymentRemindersSend,
      AGENT_SCOPES.agentRunsWrite,
    ],
    tier: AGENT_AUTONOMY_TIERS.T3,
    taskLabels: ["agent.payment_reminder"],
    costCapEnv: "PAYMENTS_AGENT_DAILY_COST_CAP_CENTS",
    featureFlagKey: "agents.payments.enabled",
    stage: "live",
    never: ["record-payment", "issue-refund", "change-invoice"],
  }),
};

const AGENT_ID_ALIASES = new Map<string, AgentId>();
for (const id of AGENT_IDS) {
  AGENT_ID_ALIASES.set(id, id);
  AGENT_ID_ALIASES.set(`nnact-${id}`, id);
}

const AGENT_SCOPE_VALUES = Object.values(AGENT_SCOPES) as string[];

function isAgentScope(value: unknown): value is AgentScope {
  return typeof value === "string" && AGENT_SCOPE_VALUES.includes(value);
}

export function resolveAgentId(value: unknown): AgentId | null {
  return typeof value === "string" ? AGENT_ID_ALIASES.get(value.trim()) ?? null : null;
}

export function isAgentId(value: unknown): value is AgentId {
  return typeof value === "string" && Object.hasOwn(AGENT_REGISTRY, value);
}

export function getAgentDefinition(id: unknown): AgentDefinition | null {
  const resolved = resolveAgentId(id);
  return resolved ? AGENT_REGISTRY[resolved] : null;
}

export function scopeBelongsToAgent(agentIdOrScope: unknown, scopeOrAgentId: unknown): boolean {
  const fromAgent = resolveAgentId(agentIdOrScope);
  if (fromAgent) return isAgentScope(scopeOrAgentId) && AGENT_REGISTRY[fromAgent].scopes.includes(scopeOrAgentId);
  if (!isAgentScope(agentIdOrScope)) return false;
  const fromScope = resolveAgentId(scopeOrAgentId);
  return fromScope !== null && AGENT_REGISTRY[fromScope].scopes.includes(agentIdOrScope);
}
