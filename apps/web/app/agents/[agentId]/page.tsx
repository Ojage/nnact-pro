"use client";

import { Suspense, use } from "react";
import { AgentDetailPage } from "@/components/agent-office/agent-detail-page";

export default function AgentPage({ params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = use(params);
  return (
    <Suspense>
      <AgentDetailPage agentId={decodeURIComponent(agentId)} />
    </Suspense>
  );
}
