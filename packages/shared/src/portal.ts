import type { PortalLinkScope } from "./index.js";

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
