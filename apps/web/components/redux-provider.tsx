"use client";

import type { ReactNode } from "react";
import { Provider } from "react-redux";
import { store } from "@/lib/redux/store";
import { GlobalProgress } from "@/components/ui/GlobalProgress";

export function ReduxProvider({ children }: { children: ReactNode }) {
  return (
    <Provider store={store}>
      <GlobalProgress />
      {children}
    </Provider>
  );
}