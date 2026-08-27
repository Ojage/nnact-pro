const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

async function diagnosticRequest<T>(path: string, init?: RequestInit): Promise<T> {
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

export type DiagnosticSessionStatus =
  | "not_started"
  | "identification_required"
  | "workflow_ready"
  | "testing"
  | "blocked"
  | "inconclusive"
  | "diagnosed"
  | "escalated"
  | "under_review"
  | "completed";

export interface DiagnosticOverview {
  activeSessions: number;
  blockedSessions: number;
  unsupportedOrUnresolved: number;
  publishedWorkflows: number;
  pilotWorkflows: number;
  openCorrections: number;
  safetyCriticalCorrections: number;
}

export interface DiagnosticWorkflow {
  id: string;
  orgId: string;
  name: string;
  productType: string;
  make?: string | null;
  modelFamily?: string | null;
  versionNumber: number;
  supportStatus: "validated" | "pilot" | "experimental" | "unsupported";
  lifecycleStatus: string;
  sourceRevision?: string | null;
  applicability: { models?: string[]; excludedModels?: string[]; notes?: string[] };
  limitations: string[];
  updatedAt: string;
  createdAt: string;
}

export interface TraceRoute {
  id: string;
  stepId: string;
  label: string;
  routeKind: string;
  endpoint1?: string | null;
  endpoint2?: string | null;
  segmentIds: string[];
  continuityValid: boolean;
  disconnectedIslands: number;
  unintendedBranches: number;
  visualAuditStatus: string;
  validationNotes?: string | null;
}

export interface DiagnosticStep {
  id: string;
  workflowId: string;
  stepKey: string;
  publicLabel: string;
  sequence: number;
  mode: "field" | "guided" | "both";
  stepType: "check" | "decision" | "reference" | "stop";
  purpose?: string | null;
  safetyState?: string | null;
  powerState?: string | null;
  operatingCondition?: string | null;
  meterMode?: string | null;
  point1Label?: string | null;
  point1Endpoint?: string | null;
  point2Label?: string | null;
  point2Endpoint?: string | null;
  connector?: string | null;
  pin?: string | null;
  wireColor?: string | null;
  expectedText?: string | null;
  unit?: string | null;
  passInterpretation?: string | null;
  failInterpretation?: string | null;
  branchRules: Record<string, unknown>;
  sourceRefs: Array<Record<string, unknown>>;
  accessibilityNote?: string | null;
  validationStatus: string;
  routes: TraceRoute[];
}

export interface EquipmentSummary {
  id: string;
  type: string;
  make?: string | null;
  model?: string | null;
  serialNumber?: string | null;
}

export interface JobSummary {
  id: string;
  title: string;
  status: string;
  scheduledAt?: string | null;
}

export interface DiagnosticSession {
  id: string;
  jobId: string;
  equipmentId: string;
  workflowId?: string | null;
  workflowVersion?: number | null;
  status: DiagnosticSessionStatus;
  customerComplaint?: string | null;
  technicianObservation?: string | null;
  errorCodes: string[];
  serviceTests: Array<{ name: string; result?: string; note?: string }>;
  disposition?: string | null;
  summary?: string | null;
  version: number;
  startedAt: string;
  completedAt?: string | null;
  updatedAt: string;
}

export interface DiagnosticMeasurement {
  id: string;
  sessionId: string;
  stepId: string;
  valueText?: string | null;
  unit?: string | null;
  result: string;
  note?: string | null;
  unableReason?: string | null;
  recordedAt: string;
}

export interface DiagnosticSessionListItem {
  session: DiagnosticSession;
  equipment: EquipmentSummary;
  workflow: DiagnosticWorkflow | null;
}

export interface DiagnosticSessionDetail extends DiagnosticSessionListItem {
  job: JobSummary;
  measurements: DiagnosticMeasurement[];
  steps: DiagnosticStep[];
}

export interface CoverageResponse {
  workflows: DiagnosticWorkflow[];
  demand: {
    totalSessions: number;
    unsupportedOrUnresolved: number;
    blocked: number;
    escalated: number;
  };
}

export interface DiagnosticOutput {
  sessionId: string;
  jobId: string;
  technician: {
    appliance: string;
    serialNumber?: string | null;
    complaint?: string | null;
    observation?: string | null;
    errorCodes: string[];
    workflow: {
      name: string;
      version: number;
      supportStatus: string;
      sourceRevision?: string | null;
    } | null;
    readings: Array<{
      check: string;
      points: string[];
      operatingCondition?: string | null;
      expected?: string | null;
      actual: string;
      result: string;
      note?: string | null;
      recordedAt: string;
    }>;
    disposition: string;
    summary: string;
    status: string;
  };
  customer: {
    appliance: string;
    concern: string;
    finding: string;
    recommendation: string;
    limitation?: string | null;
  };
}

export const diagnosticsApi = {
  overview: () => diagnosticRequest<DiagnosticOverview>("/api/diagnostics/overview"),
  coverage: () => diagnosticRequest<CoverageResponse>("/api/diagnostics/coverage"),
  workflows: () => diagnosticRequest<DiagnosticWorkflow[]>("/api/diagnostics/workflows"),
  workflow: (id: string) =>
    diagnosticRequest<{ workflow: DiagnosticWorkflow; steps: DiagnosticStep[] }>(
      `/api/diagnostics/workflows/${id}`,
    ),
  createWorkflow: (body: {
    name: string;
    productType: string;
    make?: string;
    modelFamily?: string;
    sourceRevision?: string;
    supportStatus?: DiagnosticWorkflow["supportStatus"];
    lifecycleStatus?: string;
    applicability?: { models?: string[]; excludedModels?: string[]; notes?: string[] };
    limitations?: string[];
  }) =>
    diagnosticRequest<DiagnosticWorkflow>("/api/diagnostics/workflows", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  addStep: (
    workflowId: string,
    body: {
      stepKey: string;
      publicLabel: string;
      sequence?: number;
      mode?: "field" | "guided" | "both";
      stepType?: "check" | "decision" | "reference" | "stop";
      purpose?: string;
      safetyState?: string;
      powerState?: string;
      operatingCondition?: string;
      meterMode?: string;
      point1Label?: string;
      point1Endpoint?: string;
      point2Label?: string;
      point2Endpoint?: string;
      connector?: string;
      pin?: string;
      wireColor?: string;
      expectedText?: string;
      unit?: string;
      passInterpretation?: string;
      failInterpretation?: string;
      branchRules?: Record<string, unknown>;
      sourceRefs?: Array<Record<string, unknown>>;
      accessibilityNote?: string;
      validationStatus?: string;
    },
  ) =>
    diagnosticRequest<DiagnosticStep>(`/api/diagnostics/workflows/${workflowId}/steps`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  addRoute: (
    stepId: string,
    body: {
      label: string;
      routeKind: string;
      endpoint1?: string;
      endpoint2?: string;
      segmentIds?: string[];
      continuityValid?: boolean;
      disconnectedIslands?: number;
      unintendedBranches?: number;
      visualAuditStatus?: string;
      validationNotes?: string;
    },
  ) =>
    diagnosticRequest<TraceRoute>(`/api/diagnostics/steps/${stepId}/routes`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  publishWorkflow: (workflowId: string) =>
    diagnosticRequest<DiagnosticWorkflow>(`/api/diagnostics/workflows/${workflowId}/publish`, {
      method: "POST",
    }),
  sessions: (query?: { jobId?: string; equipmentId?: string; status?: string }) => {
    const params = new URLSearchParams();
    if (query?.jobId) params.set("jobId", query.jobId);
    if (query?.equipmentId) params.set("equipmentId", query.equipmentId);
    if (query?.status) params.set("status", query.status);
    const suffix = params.toString() ? `?${params}` : "";
    return diagnosticRequest<DiagnosticSessionListItem[]>(`/api/diagnostics/sessions${suffix}`);
  },
  session: (id: string) =>
    diagnosticRequest<DiagnosticSessionDetail>(`/api/diagnostics/sessions/${id}`),
  createSession: (body: {
    jobId: string;
    equipmentId: string;
    workflowId?: string;
    customerComplaint?: string;
    technicianObservation?: string;
    errorCodes?: string[];
  }) =>
    diagnosticRequest<DiagnosticSession>("/api/diagnostics/sessions", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  patchSession: (id: string, body: Partial<DiagnosticSession>) =>
    diagnosticRequest<DiagnosticSession>(`/api/diagnostics/sessions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  completeSession: (
    id: string,
    body: {
      disposition: string;
      summary: string;
      status: "diagnosed" | "inconclusive" | "escalated" | "completed";
    },
  ) =>
    diagnosticRequest<DiagnosticOutput>(`/api/diagnostics/sessions/${id}/complete`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  output: (id: string) =>
    diagnosticRequest<DiagnosticOutput>(`/api/diagnostics/sessions/${id}/output`),
  estimateHandoff: (id: string) =>
    diagnosticRequest<{ estimate: { id: string; jobId: string }; created: boolean }>(
      `/api/diagnostics/sessions/${id}/estimate-handoff`,
      { method: "POST" },
    ),
  recordMeasurement: (
    sessionId: string,
    body: {
      stepId: string;
      valueText?: string;
      unit?: string;
      result: "pass" | "fail" | "within_range" | "out_of_range" | "unable" | "not_reproduced";
      note?: string;
      unableReason?: string;
    },
  ) =>
    diagnosticRequest<{ measurement: DiagnosticMeasurement; sessionStatus: DiagnosticSessionStatus }>(
      `/api/diagnostics/sessions/${sessionId}/measurements`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  reportCorrection: (body: {
    workflowId: string;
    workflowVersion: number;
    sessionId?: string;
    stepId?: string;
    category: string;
    severity?: "low" | "medium" | "high" | "safety_critical";
    description: string;
  }) =>
    diagnosticRequest("/api/diagnostics/corrections", {
      method: "POST",
      body: JSON.stringify(body),
    }),
};
