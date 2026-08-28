import { createSlice } from "@reduxjs/toolkit";

export interface UiState {
  /** Number of in-flight network requests (drives the global progress bar). */
  pendingRequests: number;
}

const initialState: UiState = {
  pendingRequests: 0,
};

const uiSlice = createSlice({
  name: "ui",
  initialState,
  reducers: {
    requestStarted(state) {
      state.pendingRequests += 1;
    },
    requestFinished(state) {
      state.pendingRequests = Math.max(0, state.pendingRequests - 1);
    },
  },
});

export const { requestStarted, requestFinished } = uiSlice.actions;
export const selectPendingRequests = (state: { ui: UiState }) => state.ui.pendingRequests;
export default uiSlice.reducer;