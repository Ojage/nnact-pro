import type { CurrencyCode } from "./currency.js";

export interface CustomerPortalOrgDTO {
  id: string;
  name: string;
  logoUrl?: string | null;
  publicEmail?: string | null;
  publicPhone?: string | null;
  publicAddress?: string | null;
  currency: CurrencyCode;
}

export interface CustomerPortalProfileDTO {
  account: { id: string; name: string; email: string; phone?: string | null };
  customer: {
    id: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    company?: string | null;
    address?: string | null;
  };
  org: CustomerPortalOrgDTO;
}

export interface CustomerAppointmentDTO {
  id: string;
  jobId: string;
  jobNumber?: string | null;
  jobTitle: string;
  jobStatus: string;
  serviceAddress?: string | null;
  startsAt: string;
  endsAt: string;
  technicianName?: string | null;
  upcoming: boolean;
  rescheduleRequestPending: boolean;
  cancelRequestPending: boolean;
}

export type CustomerAppointmentRequestType = "reschedule" | "cancel";
export type CustomerAppointmentRequestStatus = "pending" | "approved" | "declined";

export interface CustomerAppointmentRequestDTO {
  id: string;
  appointmentId: string;
  jobId: string;
  type: CustomerAppointmentRequestType;
  status: CustomerAppointmentRequestStatus;
  requestedStartsAt?: string | null;
  reason?: string | null;
  createdAt: string;
}

export interface CustomerEstimateOptionLineDTO {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  unit?: string | null;
}

export interface CustomerEstimateOptionDTO {
  id: string;
  label: string;
  total: number;
  recommended: boolean;
  position: number;
  lineItems: CustomerEstimateOptionLineDTO[];
}

export interface CustomerEstimateSummaryDTO {
  id: string;
  number: string;
  jobId: string;
  jobTitle: string;
  status: string;
  total: number;
  createdAt: string;
  expiresAt?: string | null;
  acceptedAt?: string | null;
  selectedOptionLabel?: string | null;
  pdfAvailable: boolean;
}

export interface CustomerEstimateDetailDTO extends CustomerEstimateSummaryDTO {
  scope?: string | null;
  recommendations?: string | null;
  exclusions?: string | null;
  options: CustomerEstimateOptionDTO[];
}

export interface CustomerInvoiceLineItemDTO {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  unit?: string | null;
}

export interface CustomerPaymentDTO {
  id: string;
  amount: number;
  method: string;
  reference?: string | null;
  paidAt: string;
}

export interface CustomerInvoiceSummaryDTO {
  id: string;
  number: string;
  jobId: string;
  jobTitle: string;
  status: string;
  total: number;
  paid: number;
  remaining: number;
  dueAt?: string | null;
  createdAt: string;
  pdfAvailable: boolean;
}

export interface CustomerInvoiceDetailDTO extends CustomerInvoiceSummaryDTO {
  lineItems: CustomerInvoiceLineItemDTO[];
  payments: CustomerPaymentDTO[];
}

export interface CustomerJobTimelineEntryDTO {
  status: string;
  changedAt: string;
  reason?: string | null;
}

export interface CustomerJobPhotoDTO {
  id: string;
  fileName?: string | null;
  contentType: string;
  category: string;
  uploadedAt: string;
  fileUrl: string;
}

export interface CustomerJobSummaryDTO {
  id: string;
  number?: string | null;
  title: string;
  status: string;
  serviceCategory?: string | null;
  serviceAddress?: string | null;
  scheduledAt?: string | null;
  completedAt?: string | null;
  total: number;
  createdAt: string;
}

export interface CustomerJobDetailDTO extends CustomerJobSummaryDTO {
  description?: string | null;
  preferredDate?: string | null;
  preferredTime?: string | null;
  technicianName?: string | null;
  appointment?: CustomerAppointmentDTO | null;
  timeline: CustomerJobTimelineEntryDTO[];
  photos: CustomerJobPhotoDTO[];
  lineItems: Array<{ id: string; description: string; quantity: number; unitPrice: number; unit?: string | null }>;
  equipment: CustomerEquipmentDTO[];
  canReview: boolean;
  review?: CustomerReviewDTO | null;
}

export interface CustomerEquipmentDTO {
  id: string;
  type: string;
  make?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  assetTag?: string | null;
  capacity?: string | null;
  installDate?: string | null;
  warrantyExpiry?: string | null;
  lastMaintenance?: string | null;
  nextMaintenance?: string | null;
  status: string;
  propertyId?: string | null;
  propertyAddress?: string | null;
  notes?: string | null;
}

export interface CustomerPropertyDTO {
  id: string;
  address: string;
  lat?: string | null;
  lng?: string | null;
  equipmentCount: number;
  jobCount: number;
  createdAt: string;
}

export interface CustomerNotificationDTO {
  id: string;
  kind: string;
  title: string;
  body?: string | null;
  link?: string | null;
  createdAt: string;
  read: boolean;
}

export interface CustomerReviewDTO {
  id: string;
  jobId: string;
  jobTitle?: string | null;
  rating: number;
  comment?: string | null;
  reply?: string | null;
  createdAt: string;
}

export type CustomerSupportRequestStatus = "open" | "answered" | "closed";

export interface CustomerSupportRequestDTO {
  id: string;
  kind: string;
  subject: string;
  message: string;
  status: CustomerSupportRequestStatus;
  response?: string | null;
  respondedAt?: string | null;
  createdAt: string;
}

export interface CustomerDocumentDTO {
  id: string;
  kind: "invoice" | "estimate" | "photo";
  documentId: string;
  number?: string | null;
  title: string;
  filename: string;
  sizeBytes?: number | null;
  createdAt: string;
  downloadUrl: string;
}

export interface CustomerServicePlanVisitDTO {
  id: string;
  title: string;
  status: string;
  visitType: string;
  scheduledAt?: string | null;
  dueAt?: string | null;
  completedAt?: string | null;
  technicianName?: string | null;
  workPerformed?: string | null;
  problemsFound: string[];
  recommendations?: string | null;
}

export interface CustomerServicePlanDetailDTO {
  id: string;
  agreementNumber: string;
  planName: string;
  status: string;
  paymentStatus: string;
  startsAt?: string | null;
  endsAt?: string | null;
  autoRenew: boolean;
  renewalType: string;
  visitsIncluded: number;
  visitsCompleted: number;
  priceCents: number;
  billingFrequency: string;
  nextVisit?: CustomerServicePlanVisitDTO | null;
  visits: CustomerServicePlanVisitDTO[];
  renewalRequestPending: boolean;
}

export interface CustomerPreferencesDTO {
  emailUpdates: boolean;
  smsUpdates: boolean;
  marketingOptIn: boolean;
  language: string;
  updatedAt?: string | null;
}

export interface CustomerCommunicationDTO {
  id: string;
  kind: string;
  subject: string;
  status: string;
  recipient: string;
  sentAt?: string | null;
  createdAt: string;
}

export interface CustomerDashboardStatsDTO {
  outstandingBalance: number;
  unpaidInvoices: number;
  pendingEstimates: number;
  upcomingAppointments: number;
  activePlans: number;
  equipmentCount: number;
  propertyCount: number;
  unreadNotifications: number;
  lifetimeSpend: number;
}

export interface CustomerDashboardDTO {
  org: CustomerPortalOrgDTO;
  customer: CustomerPortalProfileDTO["customer"];
  stats: CustomerDashboardStatsDTO;
  nextAppointment: CustomerAppointmentDTO | null;
  pendingEstimates: CustomerEstimateSummaryDTO[];
  openInvoices: CustomerInvoiceSummaryDTO[];
  activePlans: CustomerServicePlanDetailDTO[];
  recentNotifications: CustomerNotificationDTO[];
  recentJobs: CustomerJobSummaryDTO[];
}
