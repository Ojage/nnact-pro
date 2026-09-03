import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { ActivityDTO, CustomerDTO, JobDTO, JobVoiceNoteDTO, UserDTO } from "@nnact/shared";
import type {
  ChannelPublicationDTO,
  ChannelVariantDTO,
  ContentCategoryDTO,
  ContentItemDTO,
  ContentMediaDTO,
  ContentVersionDTO,
  PublicationAttemptDTO,
  PublishingConnectionDTO,
  PublishingChannel,
} from "@nnact/shared";
import type {
  Estimate,
  EstimateDetail,
  EstimateOption,
  EstimateOptionLineItem,
  Invoice as InvoiceDTO,
  InvoiceDetail,
  InvoiceLineItem,
  OrgSettingsDTO,
} from "@/lib/api";
import type {
  EquipmentModel,
  ModelProfile,
  ModelInsights,
  OrgRepairBrainHealth,
  RepairBrainSearchResults,
  TrendingKnowledge,
  SemanticSearchResult,
} from "@/lib/repair-brain-api";
import type {
  ComponentKind,
  EquipmentCategoryDTO,
  EquipmentCategoryTemplate,
  EquipmentComponentDTO,
  EquipmentConnectorDTO,
  EquipmentErrorCodeDTO,
  EquipmentSubsystemDTO,
  EquipmentSystemDTO,
  EquipmentTaxonomyDTO,
  EquipmentTerminalDTO,
  KnowledgeArticleDTO,
  KnowledgeEdgeDTO,
  KnowledgeTemplateSection,
  MeasurementPointDTO,
  OperatingSequenceDTO,
  ServiceModeDTO,
} from "@nnact/shared";
import type { DiagnosticSessionListItem } from "@/lib/diagnostics-api";
import type { PortalLinkDTO, PortalLinkScope, DocumentHubEntryDTO } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3003";

// ── DTOs (list/detail shapes not exported from the legacy api client) ──

export interface AppointmentDTO {
  id: string;
  jobId: string;
  technicianId: string | null;
  startsAt: string;
  endsAt: string;
}

export interface LineItemDTO {
  id: string;
  jobId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  createdAt: string;
}

export interface PhotoRecordDTO {
  id: string;
  orgId: string;
  jobId: string;
  objectKey: string;
  contentType: string;
  fileName: string | null;
  fileSize: number | null;
  uploadedAt: string;
  createdAt: string;
}

export interface EquipmentDTO {
  id: string;
  orgId: string;
  customerId: string;
  type: string;
  make?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  installDate?: string | null;
  warrantyExpiry?: string | null;
  notes?: string | null;
  createdAt: string;
}

export interface CoreSearchResults {
  jobs: { id: string; title: string; status: string }[];
  customers: { id: string; name: string }[];
  invoices: { id: string; number: string; status: string }[];
}

export interface ProposalRow {
  id: string;
  title: string;
  proposalType: string;
  status: string;
  createdAt: string;
}

export interface NewsletterSubscriberDTO {
  id: string;
  orgId: string;
  email: string;
  name: string | null;
  phone: string | null;
  channels: string[];
  source: string;
  status: "subscribed" | "unsubscribed" | "bounced";
  verifiedAt: string | null;
  unsubscribedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewsletterSubscribersResponseDTO {
  subscribers: NewsletterSubscriberDTO[];
  total: number;
}

export interface UpdateNewsletterSubscriberPayload {
  status: "subscribed" | "unsubscribed" | "bounced";
}

// ── Content Studio DTOs ──
export interface ContentDetailDTO extends ContentItemDTO {
  variants: ChannelVariantDTO[];
  versions: ContentVersionDTO[];
  publications: ChannelPublicationDTO[];
}

export interface ContentListResponseDTO {
  items: ContentItemDTO[];
  total: number;
}

export interface CreateContentPayload {
  type: string;
  title: string;
  summary?: string | null;
  body?: string;
  bodyDocument?: unknown[] | null;
  categoryId?: string | null;
  tagNames?: string[];
  visibility?: string;
  language?: string;
  featuredMediaId?: string | null;
}

export interface PublishOutcomeDTO {
  contentId: string;
  status: string;
  publications: ChannelPublicationDTO[];
}

export interface ConnectionDTO {
  id: string;
  channel: PublishingChannel;
  status: string;
  accountName?: string | null;
  accountId?: string | null;
  lastValidatedAt?: string | null;
  lastError?: string | null;
  metadata?: Record<string, unknown>;
  capabilities: {
    channel: PublishingChannel;
    supportsScheduling: boolean;
    supportsText: boolean;
    supportsImages: boolean;
    supportsVideo: boolean;
    maxTextLength: number;
  };
}

export interface ConnectionsResponseDTO {
  channels: PublishingChannel[];
  connections: ConnectionDTO[];
}

export const apiSlice = createApi({
  reducerPath: "api",
  baseQuery: fetchBaseQuery({
    baseUrl: API_URL,
    credentials: "include",
    headers: { "content-type": "application/json" },
  }),
  keepUnusedDataFor: 300,
  refetchOnMountOrArgChange: 60,
  refetchOnFocus: false,
  tagTypes: [
    "Job",
    "Customer",
    "Activity",
    "Appointment",
    "Invoice",
    "Estimate",
    "Equipment",
    "PortalLink",
    "Org",
    "User",
    "Photo",
    "Document",
    "RepairBrain",
    "Newsletter",
    "Content",
    "Publication",
    "Connection",
  ],
  endpoints: (builder) => ({
    // ── Jobs ──
    jobs: builder.query<JobDTO[], void>({
      query: () => "/api/jobs",
      providesTags: ["Job"],
    }),
    job: builder.query<JobDTO, string>({
      query: (id) => `/api/jobs/${id}`,
      providesTags: (_result, _error, id) => [{ type: "Job", id }],
    }),
    patchJob: builder.mutation<JobDTO, { id: string; data: Record<string, unknown> }>({
      query: ({ id, data }) => ({ url: `/api/jobs/${id}`, method: "PATCH", body: data }),
      invalidatesTags: (_result, _error, arg) => [{ type: "Job", id: arg.id }],
    }),
    createJob: builder.mutation<JobDTO, { customerId: string; title: string; description?: string }>({
      query: (body) => ({ url: "/api/jobs", method: "POST", body: { ...body, status: "lead" } }),
      invalidatesTags: ["Job"],
    }),
    jobLineItems: builder.query<LineItemDTO[], string>({
      query: (jobId) => `/api/jobs/${jobId}/line-items`,
    }),
    jobPhotos: builder.query<PhotoRecordDTO[], string>({
      query: (jobId) => `/api/photos/job/${jobId}`,
    }),
    jobVoiceNotes: builder.query<JobVoiceNoteDTO[], string>({
      query: (jobId) => `/api/jobs/${jobId}/voice-notes`,
      providesTags: (_result, _error, jobId) => [{ type: "Job", id: jobId }],
    }),
    markJobVoiceNotesDelivered: builder.mutation<{ ok: boolean }, { jobId: string }>({
      query: ({ jobId }) => ({
        url: `/api/jobs/${jobId}/voice-notes/mark-delivered`,
        method: "POST",
      }),
      invalidatesTags: (_result, _error, arg) => [{ type: "Job", id: arg.jobId }],
    }),
    markVoiceNoteRead: builder.mutation<{ ok: boolean }, { noteId: string; jobId: string }>({
      query: ({ noteId }) => ({
        url: `/api/voice-notes/${noteId}/read`,
        method: "POST",
      }),
      invalidatesTags: (_result, _error, arg) => [{ type: "Job", id: arg.jobId }],
    }),
    uploadJobPhoto: builder.mutation<PhotoRecordDTO, { jobId: string; file: File }>({
      query: ({ jobId, file }) => {
        const body = new FormData();
        body.append("file", file);
        return { url: `/api/photos/upload/${jobId}`, method: "POST", body };
      },
      invalidatesTags: (_result, _error, arg) => [{ type: "Job", id: arg.jobId }],
    }),

    // ── Customers ──
    customers: builder.query<CustomerDTO[], void>({
      query: () => "/api/customers",
      providesTags: ["Customer"],
    }),
    customer: builder.query<CustomerDTO, string>({
      query: (id) => `/api/customers/${id}`,
      providesTags: (_result, _error, id) => [{ type: "Customer", id }],
    }),
    createCustomer: builder.mutation<
      CustomerDTO,
      { name: string; email?: string; phone?: string; notes?: string }
    >({
      query: (body) => ({ url: "/api/customers", method: "POST", body }),
      invalidatesTags: ["Customer"],
    }),
    patchCustomer: builder.mutation<
      CustomerDTO,
      { id: string; body: { name?: string; email?: string | null; phone?: string | null; notes?: string | null } }
    >({
      query: ({ id, body }) => ({ url: `/api/customers/${id}`, method: "PATCH", body }),
      invalidatesTags: (_result, _error, arg) => [{ type: "Customer", id: arg.id }],
    }),

    // ── Activity feed ──
    activities: builder.query<ActivityDTO[], { customerId?: string; jobId?: string } | void>({
      query: (params) => {
        const qs = new URLSearchParams();
        if (params?.customerId) qs.set("customerId", params.customerId);
        if (params?.jobId) qs.set("jobId", params.jobId);
        const suffix = qs.toString();
        return `/api/activities${suffix ? `?${suffix}` : ""}`;
      },
      providesTags: ["Activity"],
    }),

    // ── Appointments / dispatch ──
    appointments: builder.query<AppointmentDTO[], void>({
      query: () => "/api/appointments",
      providesTags: ["Appointment"],
    }),
    assignAppointment: builder.mutation<AppointmentDTO, { id: string; technicianId: string | null }>({
      query: ({ id, technicianId }) => ({
        url: `/api/appointments/${id}`,
        method: "PATCH",
        body: { technicianId },
      }),
      invalidatesTags: ["Appointment"],
    }),
    createAppointment: builder.mutation<
      AppointmentDTO,
      { jobId: string; technicianId?: string; startsAt: string; endsAt: string }
    >({
      query: (body) => ({ url: "/api/appointments", method: "POST", body }),
      invalidatesTags: ["Appointment", "Job"],
    }),

    // ── Invoices ──
    invoices: builder.query<InvoiceDTO[], void>({
      query: () => "/api/invoices",
      providesTags: ["Invoice"],
    }),
    invoice: builder.query<InvoiceDetail, string>({
      query: (id) => `/api/invoices/${id}`,
      providesTags: (_result, _error, id) => [{ type: "Invoice", id }],
    }),
    createInvoice: builder.mutation<InvoiceDTO, { jobId: string; dueAt?: string; discountId?: string }>({
      query: (body) => ({ url: "/api/invoices", method: "POST", body }),
      invalidatesTags: ["Invoice", "Job"],
    }),
    updateInvoiceStatus: builder.mutation<{ ok: boolean; status: string }, { id: string; status: "sent" | "void" }>({
      query: ({ id, status }) => ({ url: `/api/invoices/${id}`, method: "PATCH", body: { status } }),
      invalidatesTags: (_result, _error, arg) => [{ type: "Invoice", id: arg.id }],
    }),
    addInvoiceLine: builder.mutation<
      { lineItem: InvoiceLineItem; total: number },
      { id: string; body: { description: string; quantity: number; unitPrice: number; unitCost?: number } }
    >({
      query: ({ id, body }) => ({ url: `/api/invoices/${id}/lines`, method: "POST", body }),
      invalidatesTags: (_result, _error, arg) => [{ type: "Invoice", id: arg.id }],
    }),
    updateInvoiceLine: builder.mutation<
      { lineItem: InvoiceLineItem; total: number },
      { id: string; lineId: string; body: Partial<{ description: string; quantity: number; unitPrice: number; unitCost: number }> }
    >({
      query: ({ id, lineId, body }) => ({ url: `/api/invoices/${id}/lines/${lineId}`, method: "PATCH", body }),
      invalidatesTags: (_result, _error, arg) => [{ type: "Invoice", id: arg.id }],
    }),
    deleteInvoiceLine: builder.mutation<{ ok: boolean; total: number }, { id: string; lineId: string }>({
      query: ({ id, lineId }) => ({ url: `/api/invoices/${id}/lines/${lineId}`, method: "DELETE" }),
      invalidatesTags: (_result, _error, arg) => [{ type: "Invoice", id: arg.id }],
    }),
    recordPayment: builder.mutation<
      { status: string; remaining: number; overpaid: number },
      { id: string; amount: number; method?: string }
    >({
      query: ({ id, ...body }) => ({ url: `/api/invoices/${id}/pay`, method: "POST", body }),
      invalidatesTags: (_result, _error, arg) => [{ type: "Invoice", id: arg.id }],
    }),

    // ── Estimates ──
    estimates: builder.query<Estimate[], void>({
      query: () => "/api/estimates",
      providesTags: ["Estimate"],
    }),
    estimate: builder.query<EstimateDetail, string>({
      query: (id) => `/api/estimates/${id}`,
      providesTags: (_result, _error, id) => [{ type: "Estimate", id }],
    }),
    createEstimate: builder.mutation<EstimateDetail, { jobId: string }>({
      query: (body) => ({ url: "/api/estimates", method: "POST", body }),
      invalidatesTags: ["Estimate", "Job"],
    }),
    renameEstimateOption: builder.mutation<EstimateOption, { estimateId: string; optionId: string; label: string }>({
      query: ({ estimateId, optionId, label }) => ({
        url: `/api/estimates/${estimateId}/options/${optionId}`,
        method: "PATCH",
        body: { label },
      }),
      invalidatesTags: (_result, _error, arg) => [{ type: "Estimate", id: arg.estimateId }],
    }),
    setEstimateOptionDiscount: builder.mutation<
      EstimateOption,
      { estimateId: string; optionId: string; discountId: string | null }
    >({
      query: ({ estimateId, optionId, discountId }) => ({
        url: `/api/estimates/${estimateId}/options/${optionId}`,
        method: "PATCH",
        body: { discountId },
      }),
      invalidatesTags: (_result, _error, arg) => [{ type: "Estimate", id: arg.estimateId }],
    }),
    addEstimateOptionLine: builder.mutation<
      { lineItem: EstimateOptionLineItem; total: number },
      { estimateId: string; optionId: string; body: { description: string; quantity: number; unitPrice: number; unitCost?: number } }
    >({
      query: ({ estimateId, optionId, body }) => ({
        url: `/api/estimates/${estimateId}/options/${optionId}/lines`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_result, _error, arg) => [{ type: "Estimate", id: arg.estimateId }],
    }),
    patchEstimateOptionLine: builder.mutation<
      { lineItem: EstimateOptionLineItem; total: number },
      { estimateId: string; optionId: string; lineId: string; body: Partial<{ description: string; quantity: number; unitPrice: number; unitCost: number }> }
    >({
      query: ({ estimateId, optionId, lineId, body }) => ({
        url: `/api/estimates/${estimateId}/options/${optionId}/lines/${lineId}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: (_result, _error, arg) => [{ type: "Estimate", id: arg.estimateId }],
    }),
    deleteEstimateOptionLine: builder.mutation<
      { ok: boolean; total: number },
      { estimateId: string; optionId: string; lineId: string }
    >({
      query: ({ estimateId, optionId, lineId }) => ({
        url: `/api/estimates/${estimateId}/options/${optionId}/lines/${lineId}`,
        method: "DELETE",
      }),
      invalidatesTags: (_result, _error, arg) => [{ type: "Estimate", id: arg.estimateId }],
    }),
    markEstimateSent: builder.mutation<Estimate, string>({
      query: (id) => ({ url: `/api/estimates/${id}/send`, method: "POST" }),
      invalidatesTags: (_result, _error, id) => [{ type: "Estimate", id }],
    }),
    approveEstimateOption: builder.mutation<Estimate, { id: string; body: { optionId: string; signatureName?: string } }>({
      query: ({ id, body }) => ({ url: `/api/estimates/${id}/approve`, method: "POST", body }),
      invalidatesTags: (_result, _error, arg) => [{ type: "Estimate", id: arg.id }],
    }),
    declineEstimate: builder.mutation<Estimate, string>({
      query: (id) => ({ url: `/api/estimates/${id}/decline`, method: "POST" }),
      invalidatesTags: (_result, _error, id) => [{ type: "Estimate", id }],
    }),
    copyApprovedEstimateToJob: builder.mutation<{ ok: boolean; total: number; alreadyCopied: boolean }, string>({
      query: (id) => ({ url: `/api/estimates/${id}/copy-approved-to-job`, method: "POST" }),
      invalidatesTags: (_result, _error, id) => [{ type: "Estimate", id }, { type: "Job" }],
    }),
    acceptEstimate: builder.mutation<Estimate & { jobStatus: string }, { id: string; body?: { customerName?: string } }>({
      query: ({ id, body }) => ({ url: `/api/estimates/${id}/accept`, method: "POST", body: body ?? {} }),
      invalidatesTags: (_result, _error, arg) => [{ type: "Estimate", id: arg.id }, { type: "Job" }],
    }),

    // ── Equipment ──
    equipment: builder.query<EquipmentDTO[], { customerId?: string } | void>({
      query: (params) => {
        const qs = new URLSearchParams();
        if (params?.customerId) qs.set("customerId", params.customerId);
        const suffix = qs.toString();
        return `/api/equipment${suffix ? `?${suffix}` : ""}`;
      },
      providesTags: ["Equipment"],
    }),
    createEquipment: builder.mutation<EquipmentDTO, Record<string, unknown>>({
      query: (body) => ({ url: "/api/equipment", method: "POST", body }),
      invalidatesTags: ["Equipment"],
    }),
    patchEquipment: builder.mutation<EquipmentDTO, { id: string; body: Record<string, unknown> }>({
      query: ({ id, body }) => ({ url: `/api/equipment/${id}`, method: "PATCH", body }),
      invalidatesTags: (_result, _error, arg) => [{ type: "Equipment", id: arg.id }],
    }),
    deleteEquipment: builder.mutation<void, string>({
      query: (id) => ({ url: `/api/equipment/${id}`, method: "DELETE" }),
      invalidatesTags: ["Equipment"],
    }),

    // ── Org / users ──
    org: builder.query<OrgSettingsDTO, void>({
      query: () => "/api/org/me",
      providesTags: ["Org"],
    }),
    patchOrg: builder.mutation<OrgSettingsDTO, Partial<OrgSettingsDTO>>({
      query: (body) => ({ url: "/api/org/me", method: "PATCH", body }),
      invalidatesTags: ["Org"],
    }),
    users: builder.query<UserDTO[], void>({
      query: () => "/api/users",
      providesTags: ["User"],
    }),

    // ── Global search ──
    globalSearch: builder.query<CoreSearchResults, string>({
      query: (q) => `/api/search?q=${encodeURIComponent(q)}`,
    }),

    // ── Customer portal links ──
    portalLinks: builder.query<PortalLinkDTO[], { customerId: string }>({
      query: ({ customerId }) => `/api/portal/links?customerId=${customerId}`,
      providesTags: ["PortalLink"],
    }),
    createPortalLink: builder.mutation<
      { link: PortalLinkDTO; token: string; ttlDays: number },
      { customerId: string; scopes: PortalLinkScope[]; expiresInDays?: number | null }
    >({
      query: (body) => ({ url: "/api/portal/links", method: "POST", body }),
      invalidatesTags: ["PortalLink"],
    }),
    revokePortalLink: builder.mutation<{ ok: boolean }, string>({
      query: (id) => ({ url: `/api/portal/links/${id}/revoke`, method: "POST" }),
      invalidatesTags: ["PortalLink"],
    }),
    sendPortalLink: builder.mutation<{ ok: boolean; to: string; messageId: string; sentAt: string }, string>({
      query: (id) => ({ url: `/api/portal/links/${id}/send`, method: "POST" }),
      invalidatesTags: ["PortalLink"],
    }),

    // ── Diagnostic sessions (job detail) ──
    diagnosticSessions: builder.query<
      DiagnosticSessionListItem[],
      { jobId?: string; equipmentId?: string; status?: string }
    >({
      query: (params) => {
        const qs = new URLSearchParams();
        if (params?.jobId) qs.set("jobId", params.jobId);
        if (params?.equipmentId) qs.set("equipmentId", params.equipmentId);
        if (params?.status) qs.set("status", params.status);
        const suffix = qs.toString();
        return `/api/diagnostics/sessions${suffix ? `?${suffix}` : ""}`;
      },
    }),

    // ── Repair Brain ──
    repairBrainSearch: builder.query<RepairBrainSearchResults, string>({
      query: (q) => `/api/repair-brain/search?q=${encodeURIComponent(q)}`,
    }),
    repairBrainModels: builder.query<EquipmentModel[], void>({
      query: () => "/api/repair-brain/models",
      providesTags: ["RepairBrain"],
    }),
    repairBrainModelProfile: builder.query<ModelProfile, string>({
      query: (id) => `/api/repair-brain/models/${id}/profile`,
      providesTags: ["RepairBrain"],
    }),
    repairBrainProposals: builder.query<Record<string, unknown>[], string | undefined>({
      query: (status) => `/api/repair-brain/proposals${status ? `?status=${status}` : ""}`,
      providesTags: ["Activity"],
    }),
    createProposal: builder.mutation<Record<string, unknown>, { proposalType: string; title: string; payload: Record<string, unknown> }>({
      query: (body) => ({ url: "/api/repair-brain/proposals", method: "POST", body }),
      invalidatesTags: ["Activity"],
    }),
    verifyProposal: builder.mutation<Record<string, unknown>, string>({
      query: (id) => ({ url: `/api/repair-brain/proposals/${id}/verify`, method: "POST" }),
      invalidatesTags: ["Activity"],
    }),
    repairBrainModelInsights: builder.query<ModelInsights, string>({
      query: (id) => `/api/repair-brain/models/${id}/insights`,
      providesTags: ["RepairBrain"],
    }),
    repairBrainOrgHealth: builder.query<OrgRepairBrainHealth, void>({
      query: () => "/api/repair-brain/insights/overview",
      providesTags: ["RepairBrain"],
    }),
    rateKnownFault: builder.mutation<Record<string, unknown>, string>({
      query: (id) => ({ url: `/api/repair-brain/faults/${id}/rate`, method: "POST" }),
      invalidatesTags: ["RepairBrain"],
    }),
    rateRepairProcedure: builder.mutation<Record<string, unknown>, string>({
      query: (id) => ({ url: `/api/repair-brain/procedures/${id}/rate`, method: "POST" }),
      invalidatesTags: ["RepairBrain"],
    }),
    rateModelPart: builder.mutation<Record<string, unknown>, string>({
      query: (id) => ({ url: `/api/repair-brain/parts/${id}/rate`, method: "POST" }),
      invalidatesTags: ["RepairBrain"],
    }),
    patchKnownFault: builder.mutation<Record<string, unknown>, { id: string; body: Record<string, unknown> }>({
      query: ({ id, body }) => ({ url: `/api/repair-brain/faults/${id}`, method: "PATCH", body }),
      invalidatesTags: ["RepairBrain"],
    }),
    patchRepairProcedure: builder.mutation<Record<string, unknown>, { id: string; body: Record<string, unknown> }>({
      query: ({ id, body }) => ({ url: `/api/repair-brain/procedures/${id}`, method: "PATCH", body }),
      invalidatesTags: ["RepairBrain"],
    }),
    patchModelPart: builder.mutation<Record<string, unknown>, { id: string; body: Record<string, unknown> }>({
      query: ({ id, body }) => ({ url: `/api/repair-brain/parts/${id}`, method: "PATCH", body }),
      invalidatesTags: ["RepairBrain"],
    }),
    patchTestPoint: builder.mutation<Record<string, unknown>, { id: string; body: Record<string, unknown> }>({
      query: ({ id, body }) => ({ url: `/api/repair-brain/test-points/${id}`, method: "PATCH", body }),
      invalidatesTags: ["RepairBrain"],
    }),
    importRepairBrain: builder.mutation<
      { counts: { models: number; faults: number; parts: number } },
      { models?: Record<string, unknown>[]; faults?: Record<string, unknown>[]; parts?: Record<string, unknown>[] }
    >({
      query: (body) => ({ url: "/api/repair-brain/import", method: "POST", body }),
      invalidatesTags: ["RepairBrain"],
    }),
    repairBrainTrending: builder.query<TrendingKnowledge, void>({
      query: () => "/api/repair-brain/trending",
      providesTags: ["RepairBrain"],
    }),
    repairBrainSemanticSearch: builder.query<SemanticSearchResult, string>({
      query: (q) => `/api/repair-brain/semantic-search?q=${encodeURIComponent(q)}&limit=8`,
      providesTags: ["RepairBrain"],
    }),
    repairBrainSuggestions: builder.query<string[], { q: string; kind?: string }>({
      query: ({ q, kind }) => `/api/repair-brain/autocomplete?q=${encodeURIComponent(q)}${kind ? `&kind=${kind}` : ""}`,
      providesTags: ["RepairBrain"],
    }),
    createKnownFault: builder.mutation<{ fault: Record<string, unknown>; similarExisting: unknown[] }, Record<string, unknown>>({
      query: (body) => ({ url: "/api/repair-brain/faults", method: "POST", body }),
      invalidatesTags: ["RepairBrain"],
    }),
    createRepairProcedure: builder.mutation<Record<string, unknown>, Record<string, unknown>>({
      query: (body) => ({ url: "/api/repair-brain/procedures", method: "POST", body }),
      invalidatesTags: ["RepairBrain"],
    }),
    createModelPart: builder.mutation<Record<string, unknown>, Record<string, unknown>>({
      query: (body) => ({ url: "/api/repair-brain/parts", method: "POST", body }),
      invalidatesTags: ["RepairBrain"],
    }),
    createTestPoint: builder.mutation<Record<string, unknown>, Record<string, unknown>>({
      query: (body) => ({ url: "/api/repair-brain/test-points", method: "POST", body }),
      invalidatesTags: ["RepairBrain"],
    }),
    patchRepairBrainModel: builder.mutation<Record<string, unknown>, { id: string; body: Record<string, unknown> }>({
      query: ({ id, body }) => ({ url: `/api/repair-brain/models/${id}`, method: "PATCH", body }),
      invalidatesTags: ["RepairBrain"],
    }),
    createRepairBrainModel: builder.mutation<{ model: Record<string, unknown>; created: boolean }, Record<string, unknown>>({
      query: (body) => ({ url: "/api/repair-brain/models", method: "POST", body }),
      invalidatesTags: ["RepairBrain"],
    }),
    repairBrainKnowledgeGaps: builder.query<
      Array<{ faultId: string; title: string; faultCode?: string | null; missing: string[] }>,
      string
    >({
      query: (id) => `/api/repair-brain/models/${id}/profile`,
      transformResponse: (profile: ModelProfile) => {
        const procedures = profile.repairProcedures ?? [];
        const testPoints = profile.testPoints ?? [];
        return (profile.faults ?? [])
          .map((fault) => {
            const missing: string[] = [];
            if (procedures.length === 0) missing.push("Repair procedure");
            if (testPoints.length === 0) missing.push("Test points");
            return { faultId: fault.id, title: fault.title, faultCode: fault.faultCode, missing };
          })
          .filter((row) => row.missing.length > 0);
      },
      providesTags: ["RepairBrain"],
    }),

    // ── Model Workspace / Knowledge Composer ──
    workspaceCategories: builder.query<EquipmentCategoryDTO[], void>({
      query: () => "/api/repair-brain/categories",
      providesTags: ["RepairBrain"],
    }),
    workspaceCategory: builder.query<EquipmentCategoryDTO & { sections: unknown[] }, string>({
      query: (id) => `/api/repair-brain/categories/${id}`,
      providesTags: ["RepairBrain"],
    }),
    workspaceTaxonomy: builder.query<EquipmentTaxonomyDTO, string>({
      query: (categoryId) => `/api/repair-brain/taxonomy/${categoryId}`,
      providesTags: ["RepairBrain"],
    }),
    workspaceSystems: builder.query<EquipmentSystemDTO[], string | undefined>({
      query: (categoryId) => `/api/repair-brain/systems${categoryId ? `?categoryId=${categoryId}` : ""}`,
      providesTags: ["RepairBrain"],
    }),
    workspaceSubsystems: builder.query<EquipmentSubsystemDTO[], string | undefined>({
      query: (systemId) => `/api/repair-brain/subsystems${systemId ? `?systemId=${systemId}` : ""}`,
      providesTags: ["RepairBrain"],
    }),
    workspaceComponents: builder.query<EquipmentComponentDTO[], string | undefined>({
      query: (subsystemId) => `/api/repair-brain/components${subsystemId ? `?subsystemId=${subsystemId}` : ""}`,
      providesTags: ["RepairBrain"],
    }),
    workspaceErrorCodes: builder.query<EquipmentErrorCodeDTO[], { equipmentModelId?: string; categoryId?: string }>({
      query: (params) => {
        const qs = new URLSearchParams();
        if (params?.equipmentModelId) qs.set("equipmentModelId", params.equipmentModelId);
        if (params?.categoryId) qs.set("categoryId", params.categoryId);
        const suffix = qs.toString();
        return `/api/repair-brain/errors${suffix ? `?${suffix}` : ""}`;
      },
      providesTags: ["RepairBrain"],
    }),
    workspaceSequences: builder.query<OperatingSequenceDTO[], { equipmentModelId?: string; categoryId?: string }>({
      query: (params) => {
        const qs = new URLSearchParams();
        if (params?.equipmentModelId) qs.set("equipmentModelId", params.equipmentModelId);
        if (params?.categoryId) qs.set("categoryId", params.categoryId);
        const suffix = qs.toString();
        return `/api/repair-brain/sequences${suffix ? `?${suffix}` : ""}`;
      },
      providesTags: ["RepairBrain"],
    }),
    workspaceServiceModes: builder.query<ServiceModeDTO[], { equipmentModelId?: string; categoryId?: string }>({
      query: (params) => {
        const qs = new URLSearchParams();
        if (params?.equipmentModelId) qs.set("equipmentModelId", params.equipmentModelId);
        if (params?.categoryId) qs.set("categoryId", params.categoryId);
        const suffix = qs.toString();
        return `/api/repair-brain/service-modes${suffix ? `?${suffix}` : ""}`;
      },
      providesTags: ["RepairBrain"],
    }),
    workspaceArticles: builder.query<KnowledgeArticleDTO[], { equipmentModelId?: string; categoryId?: string }>({
      query: (params) => {
        const qs = new URLSearchParams();
        if (params?.equipmentModelId) qs.set("equipmentModelId", params.equipmentModelId);
        if (params?.categoryId) qs.set("categoryId", params.categoryId);
        const suffix = qs.toString();
        return `/api/repair-brain/articles${suffix ? `?${suffix}` : ""}`;
      },
      providesTags: ["RepairBrain"],
    }),
    workspaceEdges: builder.query<KnowledgeEdgeDTO[], { equipmentModelId?: string; categoryId?: string }>({
      query: (params) => {
        const qs = new URLSearchParams();
        if (params?.equipmentModelId) qs.set("equipmentModelId", params.equipmentModelId);
        if (params?.categoryId) qs.set("categoryId", params.categoryId);
        const suffix = qs.toString();
        return `/api/repair-brain/edges${suffix ? `?${suffix}` : ""}`;
      },
      providesTags: ["RepairBrain"],
    }),
    createWorkspaceCategory: builder.mutation<EquipmentCategoryDTO, { name: string; description?: string }>({
      query: (body) => ({ url: "/api/repair-brain/categories", method: "POST", body }),
      invalidatesTags: ["RepairBrain"],
    }),
    updateWorkspaceCategory: builder.mutation<
      EquipmentCategoryDTO,
      { id: string; body: Partial<{ name: string; description?: string | null }> }
    >({
      query: ({ id, body }) => ({ url: `/api/repair-brain/categories/${id}`, method: "PATCH", body }),
      invalidatesTags: ["RepairBrain"],
    }),
    deleteWorkspaceCategory: builder.mutation<{ ok: boolean }, string>({
      query: (id) => ({ url: `/api/repair-brain/categories/${id}`, method: "DELETE" }),
      invalidatesTags: ["RepairBrain"],
    }),
    putTemplateSections: builder.mutation<
      EquipmentCategoryDTO,
      { id: string; sections: Array<{ sectionKey: string; label: string; group?: string | null; kind?: string; ordinal: number }> }
    >({
      query: ({ id, sections }) => ({
        url: `/api/repair-brain/categories/${id}/template/sections`,
        method: "PUT",
        body: sections,
      }),
      invalidatesTags: ["RepairBrain"],
    }),
    createWorkspaceSystem: builder.mutation<EquipmentSystemDTO, { categoryId: string; body: Record<string, unknown> }>({
      query: ({ categoryId, body }) => ({
        url: `/api/repair-brain/systems?categoryId=${categoryId}`,
        method: "POST",
        body,
      }),
      invalidatesTags: ["RepairBrain"],
    }),
    updateWorkspaceSystem: builder.mutation<EquipmentSystemDTO, { id: string; body: Record<string, unknown> }>({
      query: ({ id, body }) => ({ url: `/api/repair-brain/systems/${id}`, method: "PATCH", body }),
      invalidatesTags: ["RepairBrain"],
    }),
    deleteWorkspaceSystem: builder.mutation<{ ok: boolean }, string>({
      query: (id) => ({ url: `/api/repair-brain/systems/${id}`, method: "DELETE" }),
      invalidatesTags: ["RepairBrain"],
    }),
    createWorkspaceSubsystem: builder.mutation<EquipmentSubsystemDTO, { systemId: string; body: Record<string, unknown> }>({
      query: ({ systemId, body }) => ({
        url: `/api/repair-brain/subsystems?systemId=${systemId}`,
        method: "POST",
        body,
      }),
      invalidatesTags: ["RepairBrain"],
    }),
    updateWorkspaceSubsystem: builder.mutation<EquipmentSubsystemDTO, { id: string; body: Record<string, unknown> }>({
      query: ({ id, body }) => ({ url: `/api/repair-brain/subsystems/${id}`, method: "PATCH", body }),
      invalidatesTags: ["RepairBrain"],
    }),
    deleteWorkspaceSubsystem: builder.mutation<{ ok: boolean }, string>({
      query: (id) => ({ url: `/api/repair-brain/subsystems/${id}`, method: "DELETE" }),
      invalidatesTags: ["RepairBrain"],
    }),
    createWorkspaceComponent: builder.mutation<EquipmentComponentDTO, { subsystemId: string; body: Record<string, unknown> }>({
      query: ({ subsystemId, body }) => ({
        url: `/api/repair-brain/components?subsystemId=${subsystemId}`,
        method: "POST",
        body,
      }),
      invalidatesTags: ["RepairBrain"],
    }),
    updateWorkspaceComponent: builder.mutation<EquipmentComponentDTO, { id: string; body: Record<string, unknown> }>({
      query: ({ id, body }) => ({ url: `/api/repair-brain/components/${id}`, method: "PATCH", body }),
      invalidatesTags: ["RepairBrain"],
    }),
    deleteWorkspaceComponent: builder.mutation<{ ok: boolean }, string>({
      query: (id) => ({ url: `/api/repair-brain/components/${id}`, method: "DELETE" }),
      invalidatesTags: ["RepairBrain"],
    }),
    createWorkspaceConnector: builder.mutation<EquipmentConnectorDTO, { componentId: string; body: Record<string, unknown> }>({
      query: ({ componentId, body }) => ({
        url: `/api/repair-brain/connectors?componentId=${componentId}`,
        method: "POST",
        body,
      }),
      invalidatesTags: ["RepairBrain"],
    }),
    deleteWorkspaceConnector: builder.mutation<{ ok: boolean }, string>({
      query: (id) => ({ url: `/api/repair-brain/connectors/${id}`, method: "DELETE" }),
      invalidatesTags: ["RepairBrain"],
    }),
    createWorkspaceMeasurementPoint: builder.mutation<MeasurementPointDTO, { body: Record<string, unknown> }>({
      query: ({ body }) => ({ url: "/api/repair-brain/measurement-points", method: "POST", body }),
      invalidatesTags: ["RepairBrain"],
    }),
    updateWorkspaceMeasurementPoint: builder.mutation<
      MeasurementPointDTO,
      { id: string; body: Record<string, unknown> }
    >({
      query: ({ id, body }) => ({ url: `/api/repair-brain/measurement-points/${id}`, method: "PATCH", body }),
      invalidatesTags: ["RepairBrain"],
    }),
    deleteWorkspaceMeasurementPoint: builder.mutation<{ ok: boolean }, string>({
      query: (id) => ({ url: `/api/repair-brain/measurement-points/${id}`, method: "DELETE" }),
      invalidatesTags: ["RepairBrain"],
    }),
    createWorkspaceErrorCode: builder.mutation<EquipmentErrorCodeDTO, { body: Record<string, unknown> }>({
      query: ({ body }) => ({ url: "/api/repair-brain/errors", method: "POST", body }),
      invalidatesTags: ["RepairBrain"],
    }),
    updateWorkspaceErrorCode: builder.mutation<EquipmentErrorCodeDTO, { id: string; body: Record<string, unknown> }>({
      query: ({ id, body }) => ({ url: `/api/repair-brain/errors/${id}`, method: "PATCH", body }),
      invalidatesTags: ["RepairBrain"],
    }),
    deleteWorkspaceErrorCode: builder.mutation<{ ok: boolean }, string>({
      query: (id) => ({ url: `/api/repair-brain/errors/${id}`, method: "DELETE" }),
      invalidatesTags: ["RepairBrain"],
    }),
    createWorkspaceSequence: builder.mutation<OperatingSequenceDTO, { body: Record<string, unknown> }>({
      query: ({ body }) => ({ url: "/api/repair-brain/sequences", method: "POST", body }),
      invalidatesTags: ["RepairBrain"],
    }),
    updateWorkspaceSequence: builder.mutation<OperatingSequenceDTO, { id: string; body: Record<string, unknown> }>({
      query: ({ id, body }) => ({ url: `/api/repair-brain/sequences/${id}`, method: "PATCH", body }),
      invalidatesTags: ["RepairBrain"],
    }),
    deleteWorkspaceSequence: builder.mutation<{ ok: boolean }, string>({
      query: (id) => ({ url: `/api/repair-brain/sequences/${id}`, method: "DELETE" }),
      invalidatesTags: ["RepairBrain"],
    }),
    createWorkspaceArticle: builder.mutation<KnowledgeArticleDTO, { body: Record<string, unknown> }>({
      query: ({ body }) => ({ url: "/api/repair-brain/articles", method: "POST", body }),
      invalidatesTags: ["RepairBrain"],
    }),
    updateWorkspaceArticle: builder.mutation<KnowledgeArticleDTO, { id: string; body: Record<string, unknown> }>({
      query: ({ id, body }) => ({ url: `/api/repair-brain/articles/${id}`, method: "PATCH", body }),
      invalidatesTags: ["RepairBrain"],
    }),
    deleteWorkspaceArticle: builder.mutation<{ ok: boolean }, string>({
      query: (id) => ({ url: `/api/repair-brain/articles/${id}`, method: "DELETE" }),
      invalidatesTags: ["RepairBrain"],
    }),
    createWorkspaceEdge: builder.mutation<KnowledgeEdgeDTO, { body: Record<string, unknown> }>({
      query: ({ body }) => ({ url: "/api/repair-brain/edges", method: "POST", body }),
      invalidatesTags: ["RepairBrain"],
    }),
    deleteWorkspaceEdge: builder.mutation<{ ok: boolean }, string>({
      query: (id) => ({ url: `/api/repair-brain/edges/${id}`, method: "DELETE" }),
      invalidatesTags: ["RepairBrain"],
    }),

    documentsHub: builder.query<DocumentHubEntryDTO[], void>({
      query: () => "/api/documents",
      providesTags: ["Document"],
    }),

    // ── Newsletter ──
    newsletterSubscribers: builder.query<NewsletterSubscribersResponseDTO, { skip?: number; take?: number; search?: string; status?: string }>({
      query: (params) => {
        const qs = new URLSearchParams();
        if (params?.skip) qs.set("skip", String(params.skip));
        if (params?.take) qs.set("take", String(params.take));
        if (params?.search) qs.set("search", params.search);
        if (params?.status) qs.set("status", params.status);
        const suffix = qs.toString();
        return `/api/newsletter${suffix ? `?${suffix}` : ""}`;
      },
      providesTags: ["Newsletter"],
    }),
    updateNewsletterSubscriber: builder.mutation<NewsletterSubscriberDTO, { id: string; data: UpdateNewsletterSubscriberPayload }>({
      query: ({ id, data }) => ({ url: `/api/newsletter/${id}`, method: "PATCH", body: data }),
      invalidatesTags: ["Newsletter"],
    }),

    // ── Content Studio ──
    contentItems: builder.query<ContentListResponseDTO, { skip?: number; take?: number; status?: string; type?: string; search?: string }>({
      query: (params) => {
        const qs = new URLSearchParams();
        if (params?.skip) qs.set("skip", String(params.skip));
        if (params?.take) qs.set("take", String(params.take));
        if (params?.status) qs.set("status", params.status);
        if (params?.type) qs.set("type", params.type);
        if (params?.search) qs.set("search", params.search);
        const suffix = qs.toString();
        return `/api/content${suffix ? `?${suffix}` : ""}`;
      },
      providesTags: ["Content"],
    }),
    contentItem: builder.query<ContentDetailDTO, string>({
      query: (id) => `/api/content/${id}`,
      providesTags: (_result, _error, id) => [{ type: "Content", id }],
    }),
    createContentItem: builder.mutation<ContentItemDTO, CreateContentPayload>({
      query: (body) => ({ url: "/api/content", method: "POST", body }),
      invalidatesTags: ["Content"],
    }),
    patchContentItem: builder.mutation<ContentItemDTO, { id: string; data: Partial<CreateContentPayload> }>({
      query: ({ id, data }) => ({ url: `/api/content/${id}`, method: "PATCH", body: data }),
      invalidatesTags: (_result, _error, arg) => [{ type: "Content", id: arg.id }],
    }),
    deleteContentItem: builder.mutation<{ ok: true }, string>({
      query: (id) => ({ url: `/api/content/${id}`, method: "DELETE" }),
      invalidatesTags: ["Content"],
    }),
    submitContentReview: builder.mutation<{ status: string }, string>({
      query: (id) => ({ url: `/api/content/${id}/submit-review`, method: "POST" }),
      invalidatesTags: (_result, _error, id) => [{ type: "Content", id }],
    }),
    approveContent: builder.mutation<{ status: string }, string>({
      query: (id) => ({ url: `/api/content/${id}/approve`, method: "POST" }),
      invalidatesTags: (_result, _error, id) => [{ type: "Content", id }],
    }),
    rejectContent: builder.mutation<{ status: string }, string>({
      query: (id) => ({ url: `/api/content/${id}/reject`, method: "POST" }),
      invalidatesTags: (_result, _error, id) => [{ type: "Content", id }],
    }),
    publishContent: builder.mutation<PublishOutcomeDTO, { id: string; channels?: PublishingChannel[]; scheduledAt?: string }>({
      query: ({ id, channels, scheduledAt }) => ({ url: `/api/content/${id}/publish`, method: "POST", body: { channels, scheduledAt } }),
      invalidatesTags: (_result, _error, arg) => [{ type: "Content", id: arg.id }, "Publication"],
    }),
    scheduleContent: builder.mutation<PublishOutcomeDTO, { id: string; channels?: PublishingChannel[]; scheduledAt: string }>({
      query: ({ id, channels, scheduledAt }) => ({ url: `/api/content/${id}/schedule`, method: "POST", body: { channels, scheduledAt } }),
      invalidatesTags: (_result, _error, arg) => [{ type: "Content", id: arg.id }, "Publication"],
    }),
    unpublishContent: builder.mutation<{ contentId: string; removedExternal: number; archived: boolean }, string>({
      query: (id) => ({ url: `/api/content/${id}/unpublish`, method: "POST" }),
      invalidatesTags: (_result, _error, id) => [{ type: "Content", id }, "Publication"],
    }),
    upsertContentVariant: builder.mutation<
      ChannelVariantDTO,
      { id: string; channel: string; data: { enabled?: boolean; titleOverride?: string | null; bodyOverride?: string | null; caption?: string | null; mediaOverrideId?: string | null; linkBehavior?: string | null; hashtags?: string[] } }
    >({
      query: ({ id, channel, data }) => ({ url: `/api/content/${id}/variants/${channel}`, method: "PUT", body: data }),
      invalidatesTags: (_result, _error, arg) => [{ type: "Content", id: arg.id }],
    }),
    contentCategories: builder.query<ContentCategoryDTO[], void>({
      query: () => "/api/content/categories",
      providesTags: ["Content"],
    }),
    createContentCategory: builder.mutation<ContentCategoryDTO, { name: string; description?: string }>({
      query: (body) => ({ url: "/api/content/categories", method: "POST", body }),
      invalidatesTags: ["Content"],
    }),
    contentTags: builder.query<{ id: string; orgId: string; name: string; slug: string }[], void>({
      query: () => "/api/content/tags",
      providesTags: ["Content"],
    }),
    contentMedia: builder.query<ContentMediaDTO[], void>({
      query: () => "/api/content/media",
      providesTags: ["Content"],
    }),
    uploadContentMedia: builder.mutation<ContentMediaDTO, File>({
      query: (file) => {
        const body = new FormData();
        body.append("file", file);
        return { url: "/api/content/media", method: "POST", body };
      },
      invalidatesTags: ["Content"],
    }),
    patchContentMedia: builder.mutation<ContentMediaDTO, { id: string; data: { altText?: string | null; caption?: string | null; approvedForMarketing?: boolean } }>({
      query: ({ id, data }) => ({ url: `/api/content/media/${id}`, method: "PATCH", body: data }),
      invalidatesTags: ["Content"],
    }),

    // ── Publishing ──
    contentPublications: builder.query<{ items: ChannelPublicationDTO[]; total: number }, { skip?: number; take?: number; status?: string }>({
      query: (params) => {
        const qs = new URLSearchParams();
        if (params?.skip) qs.set("skip", String(params.skip));
        if (params?.take) qs.set("take", String(params.take));
        if (params?.status) qs.set("status", params.status);
        const suffix = qs.toString();
        return `/api/content/publications${suffix ? `?${suffix}` : ""}`;
      },
      providesTags: ["Publication"],
    }),
    retryPublication: builder.mutation<ChannelPublicationDTO, string>({
      query: (id) => ({ url: `/api/content/publications/${id}/retry`, method: "POST" }),
      invalidatesTags: ["Publication"],
    }),
    publicationAttempts: builder.query<PublicationAttemptDTO[], string>({
      query: (id) => `/api/content/publications/${id}/attempts`,
      providesTags: (_result, _error, id) => [{ type: "Publication", id }],
    }),

    // ── Connections ──
    publishingConnections: builder.query<ConnectionsResponseDTO, void>({
      query: () => "/api/connections",
      providesTags: ["Connection"],
    }),
    oauthConnectionStart: builder.mutation<{ url: string; state: string }, PublishingChannel>({
      query: (channel) => ({ url: `/api/connections/${channel}/oauth/start`, method: "POST" }),
    }),
    oauthConnectionCallback: builder.mutation<{ channel: string; status: string }, { channel: PublishingChannel; code: string; state: string }>({
      query: ({ channel, code, state }) => ({ url: `/api/connections/${channel}/oauth/callback`, method: "POST", body: { code, state } }),
      invalidatesTags: ["Connection"],
    }),
    disconnectConnection: builder.mutation<{ channel: string; status: string }, PublishingChannel>({
      query: (channel) => ({ url: `/api/connections/${channel}/disconnect`, method: "POST" }),
      invalidatesTags: ["Connection"],
    }),
    validateConnection: builder.mutation<{ valid: boolean; accountName?: string | null; accountId?: string | null; errorCode?: string | null; errorMessage?: string | null }, PublishingChannel>({
      query: (channel) => ({ url: `/api/connections/${channel}/validate`, method: "POST" }),
      invalidatesTags: ["Connection"],
    }),
  }),
});

export const {
  useJobsQuery,
  useJobQuery,
  usePatchJobMutation,
  useCreateJobMutation,
  useJobLineItemsQuery,
  useJobPhotosQuery,
  useJobVoiceNotesQuery,
  useMarkJobVoiceNotesDeliveredMutation,
  useMarkVoiceNoteReadMutation,
  useUploadJobPhotoMutation,
  useCustomersQuery,
  useCustomerQuery,
  useCreateCustomerMutation,
  usePatchCustomerMutation,
  useActivitiesQuery,
  useAppointmentsQuery,
  useAssignAppointmentMutation,
  useCreateAppointmentMutation,
  useInvoicesQuery,
  useInvoiceQuery,
  useCreateInvoiceMutation,
  useUpdateInvoiceStatusMutation,
  useAddInvoiceLineMutation,
  useUpdateInvoiceLineMutation,
  useDeleteInvoiceLineMutation,
  useRecordPaymentMutation,
  useEstimatesQuery,
  useEstimateQuery,
  useCreateEstimateMutation,
  useRenameEstimateOptionMutation,
  useSetEstimateOptionDiscountMutation,
  useAddEstimateOptionLineMutation,
  usePatchEstimateOptionLineMutation,
  useDeleteEstimateOptionLineMutation,
  useMarkEstimateSentMutation,
  useApproveEstimateOptionMutation,
  useDeclineEstimateMutation,
  useCopyApprovedEstimateToJobMutation,
  useAcceptEstimateMutation,
  useEquipmentQuery,
  useCreateEquipmentMutation,
  usePatchEquipmentMutation,
  useDeleteEquipmentMutation,
  useOrgQuery,
  usePatchOrgMutation,
  useUsersQuery,
  useGlobalSearchQuery,
  usePortalLinksQuery,
  useCreatePortalLinkMutation,
  useRevokePortalLinkMutation,
  useSendPortalLinkMutation,
  useDiagnosticSessionsQuery,
  useRepairBrainSearchQuery,
  useLazyRepairBrainSearchQuery,
  useRepairBrainModelsQuery,
  useRepairBrainModelProfileQuery,
  useRepairBrainProposalsQuery,
  useCreateProposalMutation,
  useVerifyProposalMutation,
  useCreateKnownFaultMutation,
  useCreateRepairProcedureMutation,
  useCreateModelPartMutation,
  useCreateTestPointMutation,
  usePatchRepairBrainModelMutation,
  useRepairBrainKnowledgeGapsQuery,
  useCreateRepairBrainModelMutation,
  useRepairBrainModelInsightsQuery,
  useRepairBrainOrgHealthQuery,
  useRateKnownFaultMutation,
  useRateRepairProcedureMutation,
  useRateModelPartMutation,
  usePatchKnownFaultMutation,
  usePatchRepairProcedureMutation,
  usePatchModelPartMutation,
  usePatchTestPointMutation,
  useImportRepairBrainMutation,
  useRepairBrainTrendingQuery,
  useRepairBrainSemanticSearchQuery,
  useLazyRepairBrainSemanticSearchQuery,
  useRepairBrainSuggestionsQuery,
  useDocumentsHubQuery,
  useWorkspaceCategoriesQuery,
  useWorkspaceCategoryQuery,
  useWorkspaceTaxonomyQuery,
  useWorkspaceSystemsQuery,
  useWorkspaceSubsystemsQuery,
  useWorkspaceComponentsQuery,
  useWorkspaceErrorCodesQuery,
  useWorkspaceSequencesQuery,
  useWorkspaceServiceModesQuery,
  useWorkspaceArticlesQuery,
  useWorkspaceEdgesQuery,
  useCreateWorkspaceCategoryMutation,
  useUpdateWorkspaceCategoryMutation,
  useDeleteWorkspaceCategoryMutation,
  usePutTemplateSectionsMutation,
  useCreateWorkspaceSystemMutation,
  useUpdateWorkspaceSystemMutation,
  useDeleteWorkspaceSystemMutation,
  useCreateWorkspaceSubsystemMutation,
  useUpdateWorkspaceSubsystemMutation,
  useDeleteWorkspaceSubsystemMutation,
  useCreateWorkspaceComponentMutation,
  useUpdateWorkspaceComponentMutation,
  useDeleteWorkspaceComponentMutation,
  useCreateWorkspaceConnectorMutation,
  useDeleteWorkspaceConnectorMutation,
  useCreateWorkspaceMeasurementPointMutation,
  useUpdateWorkspaceMeasurementPointMutation,
  useDeleteWorkspaceMeasurementPointMutation,
  useCreateWorkspaceErrorCodeMutation,
  useUpdateWorkspaceErrorCodeMutation,
  useDeleteWorkspaceErrorCodeMutation,
  useCreateWorkspaceSequenceMutation,
  useUpdateWorkspaceSequenceMutation,
  useDeleteWorkspaceSequenceMutation,
  useCreateWorkspaceArticleMutation,
  useUpdateWorkspaceArticleMutation,
  useDeleteWorkspaceArticleMutation,
  useCreateWorkspaceEdgeMutation,
  useDeleteWorkspaceEdgeMutation,
  useLazyGlobalSearchQuery,
  useNewsletterSubscribersQuery,
  useUpdateNewsletterSubscriberMutation,
  useContentItemsQuery,
  useContentItemQuery,
  useCreateContentItemMutation,
  usePatchContentItemMutation,
  useDeleteContentItemMutation,
  useSubmitContentReviewMutation,
  useApproveContentMutation,
  useRejectContentMutation,
  usePublishContentMutation,
  useScheduleContentMutation,
  useUnpublishContentMutation,
  useUpsertContentVariantMutation,
  useContentCategoriesQuery,
  useCreateContentCategoryMutation,
  useContentTagsQuery,
  useContentMediaQuery,
  useUploadContentMediaMutation,
  usePatchContentMediaMutation,
  useContentPublicationsQuery,
  useRetryPublicationMutation,
  usePublicationAttemptsQuery,
  usePublishingConnectionsQuery,
  useOauthConnectionStartMutation,
  useOauthConnectionCallbackMutation,
  useDisconnectConnectionMutation,
  useValidateConnectionMutation,
} = apiSlice;