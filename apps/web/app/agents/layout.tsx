"use client";

import { RoleGate } from "@/components/role-gate";

export default function AgentsLayout({ children }: { children: React.ReactNode }) {
  return <RoleGate>{children}</RoleGate>;
}
