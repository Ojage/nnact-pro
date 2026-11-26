"use client";

import { useEffect, useState } from "react";
import { apiSlice } from "@/lib/redux/api";

export const BRANCH_CHANGE_EVENT = "nnact:branch-change";
export const OPEN_BRANCH_SELECTOR_EVENT = "nnact:open-branch-selector";

export interface BranchDTO {
  id: string;
  name: string;
  isDefault: boolean;
}

export interface WorkingOrgDTO {
  id: string;
  name: string;
  shortName: string;
  publicId: string;
}

export interface MyBranchesDTO {
  org: WorkingOrgDTO;
  branches: BranchDTO[];
  requestedBranchId: string | null;
  activeBranchId: string | null;
  canAddBranch: false;
}

const branchesApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    myBranches: builder.query<MyBranchesDTO, string | undefined>({
      query: (branch) => `/api/branches/me${branch ? `?branch=${encodeURIComponent(branch)}` : ""}`,
    }),
  }),
});

export const { useMyBranchesQuery } = branchesApi;

export function requestBranchSelector(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(OPEN_BRANCH_SELECTOR_EVENT));
}

export function setActiveBranchInUrl(branchId: string): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("branch", branchId);
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  window.dispatchEvent(new CustomEvent(BRANCH_CHANGE_EVENT, { detail: { branch: branchId } }));
}

export function useRequestedBranch(): string | null {
  const [branch, setBranch] = useState<string | null>(null);
  useEffect(() => {
    const read = () => setBranch(new URLSearchParams(window.location.search).get("branch"));
    read();
    window.addEventListener("popstate", read);
    window.addEventListener(BRANCH_CHANGE_EVENT, read);
    return () => {
      window.removeEventListener("popstate", read);
      window.removeEventListener(BRANCH_CHANGE_EVENT, read);
    };
  }, []);
  return branch;
}

/** The organization and branch this session works in. */
export function useWorkingScope() {
  const requested = useRequestedBranch();
  const { data, isLoading, isError } = useMyBranchesQuery(requested ?? undefined);
  const branch = (data?.branches ?? []).find((item) => item.id === data?.activeBranchId) ?? null;

  useEffect(() => {
    if (data?.requestedBranchId && data.activeBranchId && data.requestedBranchId !== data.activeBranchId) {
      setActiveBranchInUrl(data.activeBranchId);
    }
  }, [data?.requestedBranchId, data?.activeBranchId]);

  return { org: data?.org ?? null, branch, branches: data?.branches ?? [], isLoading, isError };
}
