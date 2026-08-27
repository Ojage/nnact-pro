const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

async function rbRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("NNPtoken");
    if (token) headers.authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...headers },
    cache: "no-store",
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`${response.status}: ${body || response.statusText}`);
  }
  const text = await response.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

export interface EquipmentModel {
  id: string;
  orgId: string;
  manufacturer: string;
  brand?: string | null;
  modelNumber: string;
  modelName?: string | null;
  variant?: string | null;
  category: string;
  subcategory?: string | null;
  productFamily?: string | null;
  specifications: Record<string, unknown>;
  aliases: string[];
  normalizedIdentifier: string;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface KnownFault {
  id: string;
  equipmentModelId: string;
  faultCode?: string | null;
  title: string;
  description?: string | null;
  severity?: string | null;
  frequency?: string | null;
  probableCauses: string[];
  confidenceStatus: string;
  verificationStatus: string;
  symptoms?: Array<{ id: string; label: string }>;
}

export interface ModelProfile {
  model: EquipmentModel;
  faults: KnownFault[];
  repairProcedures: Array<{ id: string; title: string; description?: string | null }>;
  parts: Array<{ id: string; partName: string; oemPartNumber?: string | null }>;
  testPoints: Array<{ id: string; component?: string | null; description?: string | null }>;
  documents: Array<{ id: string; title: string; documentType: string }>;
  explodedViews: Array<{ id: string; title: string }>;
  diagnosticWorkflows: Array<{ id: string; name: string }>;
  repairStats: {
    totalRepairs: number;
    successfulRepairs: number;
    averageLaborMinutes: number;
    byFault: Record<string, { count: number; topSolutions: Array<{ action: string; count: number }> }>;
  };
  instanceCount: number;
}

export interface RepairBrainSearchResults {
  models: Array<{ id: string; manufacturer: string; modelNumber: string; modelName?: string | null; category: string }>;
  faults: Array<{ id: string; equipmentModelId: string; title: string; faultCode?: string | null }>;
  parts: Array<{ id: string; equipmentModelId: string; partName: string; oemPartNumber?: string | null }>;
  procedures: Array<{ id: string; equipmentModelId: string; title: string; type: string }>;
  documents: Array<{ id: string; title: string; documentType: string }>;
  repairHistory: Array<{ id: string; outcome: string; conclusion?: string | null }>;
}

export interface EquipmentTimeline {
  instance: Record<string, unknown>;
  model: EquipmentModel | null;
  diagnosticSessions: Array<Record<string, unknown>>;
  repairOutcomes: Array<Record<string, unknown>>;
  recentMeasurements: Array<Record<string, unknown>>;
}

export const repairBrainApi = {
  search: (q: string) => rbRequest<RepairBrainSearchResults>(`/api/repair-brain/search?q=${encodeURIComponent(q)}`),

  listModels: () => rbRequest<EquipmentModel[]>("/api/repair-brain/models"),

  getModel: (id: string) => rbRequest<EquipmentModel>(`/api/repair-brain/models/${id}`),

  getModelProfile: (id: string) => rbRequest<ModelProfile>(`/api/repair-brain/models/${id}/profile`),

  createModel: (body: Record<string, unknown>) =>
    rbRequest<{ model: EquipmentModel; created: boolean }>("/api/repair-brain/models", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  createFault: (body: Record<string, unknown>) =>
    rbRequest<{ fault: KnownFault; similarExisting: KnownFault[] }>("/api/repair-brain/faults", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  createOutcome: (body: Record<string, unknown>) =>
    rbRequest<Record<string, unknown>>("/api/repair-brain/outcomes", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  createProposal: (body: Record<string, unknown>) =>
    rbRequest<Record<string, unknown>>("/api/repair-brain/proposals", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getEquipmentTimeline: (equipmentId: string) =>
    rbRequest<EquipmentTimeline>(`/api/repair-brain/instances/${equipmentId}/timeline`),

  listProposals: (status?: string) =>
    rbRequest<Array<Record<string, unknown>>>(
      `/api/repair-brain/proposals${status ? `?status=${status}` : ""}`,
    ),

  verifyProposal: (id: string) =>
    rbRequest<Record<string, unknown>>(`/api/repair-brain/proposals/${id}/verify`, { method: "POST" }),

  getJobContext: (jobId: string) =>
    rbRequest<JobRepairBrainContext>(`/api/repair-brain/jobs/${jobId}/context`),

  suggestFaults: (equipmentModelId: string, symptomLabels: string[]) =>
    rbRequest<SuggestedFault[]>(
      `/api/repair-brain/faults/suggest?equipmentModelId=${equipmentModelId}&symptoms=${encodeURIComponent(symptomLabels.join("|"))}`,
    ),

  getFaultWorkflows: (faultId: string) =>
    rbRequest<Array<{ id: string; name: string }>>(`/api/repair-brain/faults/${faultId}/workflows`),

  getProposalDraft: (jobId: string) =>
    rbRequest<ProposalDraft>(`/api/repair-brain/jobs/${jobId}/proposal-draft`),

  linkEquipmentModel: (equipmentId: string) =>
    rbRequest<{ equipment: Record<string, unknown>; model: EquipmentModel | null; created: boolean }>(
      `/api/repair-brain/equipment/${equipmentId}/link-model`,
      { method: "POST" },
    ),

  createMeasurement: (body: Record<string, unknown>) =>
    rbRequest<Record<string, unknown>>("/api/repair-brain/measurements", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  createSymptom: (label: string) =>
    rbRequest<{ id: string; label: string }>("/api/repair-brain/symptoms", {
      method: "POST",
      body: JSON.stringify({ label }),
    }),
};

export interface SuggestedFault {
  faultId: string;
  title: string;
  faultCode?: string | null;
  score: number;
  matchedSymptoms: string[];
}

export interface ProposalDraft {
  proposalType: string;
  title: string;
  payload: Record<string, unknown>;
  sourceJobId: string;
  sourceEquipmentId?: string;
  sourceSessionId?: string;
  sourceRepairOutcomeId?: string;
  equipmentModelId?: string;
}

export interface JobRepairBrainContext {
  job: { id: string; title: string; status: string; description?: string | null };
  equipment: Record<string, unknown> | null;
  equipmentModel: EquipmentModel | null;
  knownFaults: KnownFault[];
  availableSymptoms: Array<{ id: string; label: string; normalizedLabel: string }>;
  modelParts: Array<{ id: string; partName: string; oemPartNumber?: string | null; catalogItemId?: string | null }>;
  catalogItems: Array<{ id: string; name: string; priceCents: number }>;
  diagnosticSessions: Array<Record<string, unknown> & { workflow?: { id: string; name: string } | null }>;
  repairOutcomes: Array<Record<string, unknown>>;
  fieldMeasurements: Array<Record<string, unknown>>;
  repairStats: ModelProfile["repairStats"] | null;
  knowledgeProposals: Array<Record<string, unknown>>;
};
