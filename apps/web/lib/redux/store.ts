import { configureStore, isFulfilled, isPending, isRejected, type Middleware, type UnknownAction } from "@reduxjs/toolkit";
import { loadingStore } from "@/lib/loadingStore";
import { apiSlice } from "./api";
import uiReducer from "./uiSlice";

type ApiRootState = {
  api: ReturnType<typeof apiSlice.reducer>;
};

type RtkMeta = {
  requestId?: string;
  arg?: {
    type?: "query" | "mutation";
    endpointName?: string;
    originalArgs?: unknown;
  };
};

const trackedRequestIds = new Set<string>();

function shouldTrackRequest(action: UnknownAction, state: ApiRootState): boolean {
  const meta = (action as { meta?: RtkMeta }).meta;
  const arg = meta?.arg;
  if (!arg?.endpointName) return true;

  if (arg.type === "mutation") return true;

  if (arg.type === "query") {
    const endpoint = apiSlice.endpoints[arg.endpointName as keyof typeof apiSlice.endpoints];
    if (!endpoint || !("select" in endpoint)) return true;
    const select = endpoint.select as (args: unknown) => (state: ApiRootState) => { data?: unknown };
    return select(arg.originalArgs)(state).data === undefined;
  }

  return true;
}

/**
 * Mirrors RTK Query request lifecycle into the global loading store.
 * Only tracks initial loads (no cached data) and mutations — background
 * refetches no longer hold the progress bar open during navigation.
 */
const networkActivityMiddleware: Middleware = (api) => (next) => (action) => {
  const meta = (action as { meta?: RtkMeta }).meta;
  const requestId = meta?.requestId;

  if (isPending(action)) {
    if (shouldTrackRequest(action, api.getState() as ApiRootState)) {
      if (requestId) trackedRequestIds.add(requestId);
      loadingStore.begin();
    }
  } else if (isFulfilled(action) || isRejected(action)) {
    if (requestId && trackedRequestIds.has(requestId)) {
      trackedRequestIds.delete(requestId);
      loadingStore.end();
    }
  }

  return next(action);
};

export function makeStore() {
  return configureStore({
    reducer: {
      [apiSlice.reducerPath]: apiSlice.reducer,
      ui: uiReducer,
    },
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false }).concat(apiSlice.middleware, networkActivityMiddleware),
  });
}

export const store = makeStore();

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];
