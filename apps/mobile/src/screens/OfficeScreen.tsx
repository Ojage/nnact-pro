import type { JobDTO } from "@nnact/shared";
import type { SyncService } from "../sync/service";
import type { Appointment, DiagnosticListItem } from "../hooks/useFieldData";
import type { StoredStaffSession } from "../auth-storage";
import { type Palette } from "../theme";
import { OfficeNavigator } from "./office/OfficeNavigator";

/**
 * Office workspace for owner / dispatcher (and secretary) roles:
 * dispatch & scheduling, customers & equipment, estimates & invoices,
 * service plans & agreements, and finance review/record. The field
 * offline/sync props are accepted for compatibility; this side of the
 * app is online-first.
 */
export function OfficeScreen({
  colors,
  session,
  jobs,
  appointments,
  diagnostics,
  loading,
  refreshing,
  onRefresh,
  onOpenNotifications,
  onOpenJob,
}: {
  colors: Palette;
  session: StoredStaffSession;
  jobs: JobDTO[];
  appointments: Appointment[];
  diagnostics: DiagnosticListItem[];
  loading: boolean;
  offline: boolean;
  lastSync: string | null;
  refreshing: boolean;
  error: string | null;
  onRefresh: () => void;
  getSyncService: () => SyncService | null;
  onOpenNotifications: () => void;
  onOpenJob: (jobId: string) => void;
  onOpenSession: (sessionId: string) => void;
}) {
  return (
    <OfficeNavigator
      colors={colors}
      session={session}
      jobs={jobs}
      appointments={appointments}
      diagnostics={diagnostics}
      loading={loading}
      refreshing={refreshing}
      onRefresh={onRefresh}
      onOpenNotifications={onOpenNotifications}
      onOpenJob={onOpenJob}
    />
  );
}