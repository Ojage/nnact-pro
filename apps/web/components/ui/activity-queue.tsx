"use client";

type ActivityJob = {
  id: string;
  status: "queued" | "running" | "completed" | "failed" | "retry";
};

const emptySummary = {
  failedCount: 0,
  runningCount: 0,
  queuedCount: 0,
  retryCount: 0,
  completedCount: 0,
  totalCount: 0,
};

/** Placeholder hook until the system console activity queue is wired up. */
export function useActivityQueue() {
  return {
    isDashboard: false,
    badgeCount: 0,
    isOpen: false,
    isDismissed: false,
    jobs: [] as ActivityJob[],
    activeJobs: [] as ActivityJob[],
    summary: emptySummary,
    isCollapsed: false,
    pendingAction: null as string | null,
    expandedJobs: new Set<string>(),
    isAdmin: false,
    currentUserName: "",
    togglePanel: () => {},
    setIsCollapsed: (_collapsed: boolean) => {},
    clearCompleted: () => {},
    closePanel: () => {},
    hideUntilNextJob: () => {},
    refreshAll: () => {},
    toggleExpanded: (_jobId: string) => {},
    retry: (_jobId: string) => {},
    cancel: (_jobId: string) => {},
    dismissHistoryItem: (_jobId: string) => {},
  };
}

export function ActivityQueueTrigger(_props: {
  badgeCount?: number;
  className?: string;
  onClick?: () => void;
}) {
  return null;
}

export function ActivityQueuePanel(_props: Record<string, unknown>) {
  return null;
}
