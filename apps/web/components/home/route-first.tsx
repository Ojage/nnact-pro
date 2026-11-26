"use client";

import type { ReactNode } from "react";
import { useSessionUser } from "@/lib/use-session-user";

/** Technicians see their route before the office numbers; everyone else sees numbers first. */
export function RouteFirst({ metrics, route }: { metrics: ReactNode; route: ReactNode }) {
  const { user } = useSessionUser();
  return user?.role === "technician" ? (
    <>
      {route}
      {metrics}
    </>
  ) : (
    <>
      {metrics}
      {route}
    </>
  );
}
