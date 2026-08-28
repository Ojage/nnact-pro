import { useDispatch, useSelector, useStore, type TypedUseSelectorHook } from "react-redux";
import type { AppDispatch, RootState } from "./store";

/**
 * Type-safe Redux hooks. Prefer these over the plain react-redux hooks
 * throughout the app (see `lib/redux/store.ts`).
 */
export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
export const useAppStore = useStore<RootState>;