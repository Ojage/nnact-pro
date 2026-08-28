import type { RepairBrainSearchResults } from "./repair-brain.js";

export const MOBILE_SEARCH_CATEGORIES = [
  "service",
  "job",
  "customer",
  "invoice",
  "estimate",
  "appointment",
  "equipment",
  "repair_model",
  "repair_fault",
  "repair_part",
  "repair_procedure",
  "help",
] as const;

export type MobileSearchCategory = (typeof MOBILE_SEARCH_CATEGORIES)[number];

export interface MobileSearchResultItem {
  id: string;
  category: MobileSearchCategory;
  title: string;
  subtitle?: string;
  badge?: string;
  payload?: Record<string, string>;
}

export interface StaffSearchResponseDTO {
  jobs: Array<{ id: string; title: string; status: string }>;
  customers: Array<{ id: string; name: string; email?: string | null; phone?: string | null }>;
  invoices: Array<{ id: string; number: string; status: string }>;
  estimates: Array<{ id: string; number: string; status: string }>;
  appointments: Array<{ id: string; jobTitle: string; startsAt: string }>;
  equipment: Array<{ id: string; label: string; serialNumber?: string | null }>;
  repairBrain: RepairBrainSearchResults;
}

export interface CustomerSearchResponseDTO {
  jobs: Array<{ id: string; title: string; status: string }>;
  estimates: Array<{ id: string; number: string; status: string }>;
  invoices: Array<{ id: string; number: string; status: string }>;
}
