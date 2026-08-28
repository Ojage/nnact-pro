import { configureStore, isFulfilled, isPending, isRejected, type Middleware } from "@reduxjs/toolkit";
import { loadingStore } from "@/lib/loadingStore";
import { apiSlice } from "./api";
import uiReducer from "./uiSlice";

/**
 * Mirrors RTK Query request lifecycle into the global loading store so the
 * top progress bar reflects both RTK Query and legacy `api` fetches.
 */
const networkActivityMiddleware: Middleware = () => (next) => (action) => {
  if (isPending(action)) {
    loadingStore.begin();
  } else if (isFulfilled(action) || isRejected(action)) {
    loadingStore.end();
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
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;