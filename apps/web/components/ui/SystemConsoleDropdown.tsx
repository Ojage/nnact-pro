import { createPortal } from 'react-dom';
import { ActivityQueuePanel, ActivityQueueTrigger, useActivityQueue } from './activity-queue';

export function SystemConsoleDropdown({ className }: { className?: string }) {
  const queue = useActivityQueue();

  if (!queue.isDashboard) {
    return null;
  }

  return (
    <>
      <ActivityQueueTrigger
        badgeCount={queue.badgeCount}
        className={className}
        onClick={queue.togglePanel}
      />

      {queue.isOpen && !queue.isDismissed &&
        createPortal(
          <ActivityQueuePanel
            jobs={queue.jobs}
            activeJobCount={queue.activeJobs.length}
            failedCount={queue.summary.failedCount}
            runningCount={queue.summary.runningCount}
            queuedCount={queue.summary.queuedCount}
            retryCount={queue.summary.retryCount}
            completedCount={queue.summary.completedCount}
            totalCount={queue.summary.totalCount}
            isCollapsed={queue.isCollapsed}
            pendingAction={queue.pendingAction}
            expandedJobs={queue.expandedJobs}
            isAdmin={queue.isAdmin}
            currentUserName={queue.currentUserName}
            onToggleCollapsed={() => queue.setIsCollapsed(!queue.isCollapsed)}
            onClearCompleted={queue.clearCompleted}
            onClose={queue.closePanel}
            onHideUntilNextJob={queue.hideUntilNextJob}
            onRefreshAll={queue.refreshAll}
            onToggleExpanded={queue.toggleExpanded}
            onRetry={queue.retry}
            onCancel={queue.cancel}
            onDismiss={queue.dismissHistoryItem}
          />,
          document.body,
        )
      }
    </>
  );
}
