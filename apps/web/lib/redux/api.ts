import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { ActivityDTO, CustomerDTO, JobDTO, JobVoiceNoteDTO, UserDTO } from "@nnact/shared";
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
  RepairBrainSearchResults,
} from "@/lib/repair-brain-api";
import type { DiagnosticSessionListItem } from "@/lib/diagnostics-api";
import type { PortalLinkDTO, PortalLinkScope, DocumentHubEntryDTO } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

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
    }),
    repairBrainModelProfile: builder.query<ModelProfile, string>({
      query: (id) => `/api/repair-brain/models/${id}/profile`,
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

    documentsHub: builder.query<DocumentHubEntryDTO[], void>({
      query: () => "/api/documents",
      providesTags: ["Document"],
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
  useDocumentsHubQuery,
  useLazyGlobalSearchQuery,
} = apiSlice;