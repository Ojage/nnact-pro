import type { AppDispatch } from "@/lib/redux/store";
import { apiSlice } from "@/lib/redux/api";

const DETAIL_ROUTE =
  /^\/(jobs|customers|invoices|estimates|equipment|diagnostics|repair-brain\/models)\/([^/?#]+)/;

function warmSharedLists(dispatch: AppDispatch) {
  void dispatch(apiSlice.util.prefetch("jobs", undefined, { force: false }));
  void dispatch(apiSlice.util.prefetch("customers", undefined, { force: false }));
  void dispatch(apiSlice.util.prefetch("org", undefined, { force: false }));
}

/** Prefetch RTK Query data for a route before navigation (hover/focus). */
export function prefetchRoute(dispatch: AppDispatch, href: string) {
  const path = href.split("?")[0]?.split("#")[0] ?? "";
  if (!path || path === "/") return;

  const match = path.match(DETAIL_ROUTE);
  if (!match) return;

  const [, kind, id] = match;
  warmSharedLists(dispatch);

  switch (kind) {
    case "jobs":
      void dispatch(apiSlice.util.prefetch("job", id, { force: false }));
      void dispatch(apiSlice.util.prefetch("jobLineItems", id, { force: false }));
      void dispatch(apiSlice.util.prefetch("activities", { jobId: id }, { force: false }));
      void dispatch(apiSlice.util.prefetch("diagnosticSessions", { jobId: id }, { force: false }));
      void dispatch(apiSlice.util.prefetch("invoices", undefined, { force: false }));
      void dispatch(apiSlice.util.prefetch("appointments", undefined, { force: false }));
      break;
    case "customers":
      void dispatch(apiSlice.util.prefetch("customer", id, { force: false }));
      break;
    case "invoices":
      void dispatch(apiSlice.util.prefetch("invoice", id, { force: false }));
      void dispatch(apiSlice.util.prefetch("invoices", undefined, { force: false }));
      break;
    case "estimates":
      void dispatch(apiSlice.util.prefetch("estimate", id, { force: false }));
      void dispatch(apiSlice.util.prefetch("estimates", undefined, { force: false }));
      break;
    case "equipment":
      void dispatch(apiSlice.util.prefetch("equipment", undefined, { force: false }));
      break;
    case "diagnostics":
      void dispatch(apiSlice.util.prefetch("diagnosticSessions", { jobId: id }, { force: false }));
      break;
    case "repair-brain/models":
      void dispatch(apiSlice.util.prefetch("repairBrainModelProfile", id, { force: false }));
      break;
    default:
      break;
  }
}

/** Warm list caches once per session so detail pages resolve related records instantly. */
export function warmAppCaches(dispatch: AppDispatch) {
  const endpoints = [
    ["jobs", undefined],
    ["customers", undefined],
    ["invoices", undefined],
    ["estimates", undefined],
    ["appointments", undefined],
    ["org", undefined],
  ] as const;

  for (const [name, arg] of endpoints) {
    void dispatch(apiSlice.util.prefetch(name, arg, { force: false }));
  }
}
