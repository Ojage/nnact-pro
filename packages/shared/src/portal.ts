import type { JobStatus, PortalLinkScope } from "./index.js";

export interface PortalEstimateOptionDTO {
  id: string;
  label: string;
  total: number;
  position: number;
}

export interface PortalEstimateDTO {
  id: string;
  number: string;
  status: string;
  total: number;
  expiresAt: string | null;
  options: PortalEstimateOptionDTO[];
}

export interface PortalServiceHistoryDTO {
  id: string;
  title: string;
  status: string;
  scheduledAt: string | null;
  completedAt: string | null;
  total: number;
}

export interface PortalSessionDTO {
  org: {
    id: string;
    name: string;
    logoUrl?: string | null;
    publicEmail?: string | null;
    publicPhone?: string | null;
    publicAddress?: string | null;
    sponsorEnabled?: boolean;
  };
  customer: { name: string; email?: string | null; phone?: string | null };
  views: PortalLinkScope[];
  balance: {
    invoices: Array<{ id: string; number: string; total: number; paid: number; remaining: number; dueAt: string | null }>;
    totalRemaining: number;
    paymentInstructions: string;
  };
  checkout: { available: boolean; totalRemaining: number };
  receipts: Array<{
    id: string;
    number: string;
    total: number;
    paidAt: string | null;
    payments: Array<{ amount: number; method: string; paidAt: string }>;
  }>;
  servicePlans: Array<{
    id: string;
    planName: string;
    status: string;
    visitsIncluded: number;
    visitsCompleted: number;
    renewsAt: string | null;
    nextVisit: { title: string; dueAt: string | null; status: string } | null;
  }>;
  estimates: PortalEstimateDTO[];
  serviceHistory: PortalServiceHistoryDTO[];
}

export interface PublicBookingConfigDTO {
  org: {
    id: string;
    name: string;
    publicEmail?: string | null;
    publicPhone?: string | null;
    publicAddress?: string | null;
  };
  serviceCategories: Array<{ id: string; label: string; services: readonly string[] }>;
  serviceAreas: string[];
  businessHours: {
    timezone: string;
    workDays: string[];
    startTime: string;
    endTime: string;
  };
  emergencyPhone?: string | null;
}

/** Public marketing + booking profile for nnact.com and other frontends. */
export interface PublicMarketingProfileDTO extends PublicBookingConfigDTO {
  company: {
    legalName: string;
    shortName: string;
    tagline: string;
    motto: string;
    customerPromise: string;
  };
  brandColor: string;
  logoUrl: string;
  phones: string[];
  email: string;
  website: string;
  featuredServices: Array<{
    id: string;
    title: string;
    description: string;
    categoryLabel: string;
  }>;
  location: {
    streetAddress: string;
    city: string;
    region: string;
    country: string;
    fullAddress: string;
    geo: { latitude: number; longitude: number };
  };
  hours: {
    weekdays: string;
    saturday: string | null;
    sunday: string;
    emergency: string;
    /** schema.org openingHours format, e.g. Mo-Sa 07:30-18:00 */
    schema: string;
  };
  contact: {
    whatsAppPhone: string;
    whatsAppUrl: string;
    mapsUrl: string;
    mapsDirectionsUrl: string;
  };
  social: {
    facebook?: string | null;
    whatsApp?: string | null;
    linkedin?: string | null;
  };
}

export interface PublicBookingResultDTO {
  ok: true;
  /** A "customer request" job row. */
  requestId: string;
  /** One-time link payload; only the hash is stored server-side. */
  trackingToken: string;
  trackingUrl?: string | null;
  /** True when a confirmation email was attempted (SMTP may still fail-closed). */
  emailSent?: boolean;
}

export interface PublicRequestStatusDTO {
  ok: true;
  requestId: string;
  status: JobStatus;
  title: string;
  customerName: string;
  serviceCategory?: string | null;
  serviceAddress?: string | null;
  preferredDate?: string | null;
  preferredTime?: string | null;
  createdAt: string;
  scheduledAt?: string | null;
  updatedAt: string;
}
