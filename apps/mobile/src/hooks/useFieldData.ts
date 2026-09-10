import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { JobDTO } from "@nnact/shared";
import { staffFetch, staffRefresh } from "../auth-api";
import { saveStaffSession, type StoredStaffSession } from "../auth-storage";
import { fetchUnreadNotificationCount } from "../field-api";
import { SyncService, type FieldPackage } from "../sync";
import { getApiUrl } from "../env";

export interface Appointment {
  id: string;
  jobId: string;
  technicianId: string | null;
  startsAt: string;
  endsAt: string;
}

export interface DiagnosticListItem {
  session: {
    id: string;
    jobId: string;
    status: string;
    customerComplaint?: string | null;
    updatedAt: string;
  };
  equipment: {
    id: string;
    type: string;
    make?: string | null;
    model?: string | null;
    serialNumber?: string | null;
  };
  workflow: {
    id: string;
    name: string;
    supportStatus: string;
  } | null;
}

async function fetchJson<T>(
  session: StoredStaffSession,
  path: string,
  onSession?: (next: StoredStaffSession) => void,
): Promise<T> {
  try {
    return await staffFetch<T>(session, path);
  } catch (error) {
    if (error instanceof Error && error.message === "session_expired") {
      const refreshed = await staffRefresh(session.refreshToken);
      await saveStaffSession(refreshed);
      onSession?.(refreshed);
      return staffFetch<T>(refreshed, path);
    }
    throw error;
  }
}

function packageToDiagnostic(fieldPackage: FieldPackage): DiagnosticListItem | null {
  if (!fieldPackage.session || !fieldPackage.equipment) return null;
  return {
    session: fieldPackage.session as unknown as DiagnosticListItem["session"],
    equipment: fieldPackage.equipment as unknown as DiagnosticListItem["equipment"],
    workflow: fieldPackage.workflow
      ? (fieldPackage.workflow as unknown as DiagnosticListItem["workflow"])
      : null,
  };
}

function packageToAppointment(fieldPackage: FieldPackage): Appointment | null {
  const job = fieldPackage.job as Partial<JobDTO> & { scheduledAt?: string | null };
  if (!job.id || !job.scheduledAt) return null;
  const start = new Date(job.scheduledAt);
  if (Number.isNaN(start.getTime())) return null;
  return {
    id: `cached-${job.id}`,
    jobId: job.id,
    technicianId: null,
    startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + 90 * 60 * 1000).toISOString(),
  };
}

export function useFieldData(session: StoredStaffSession, onSession: (next: StoredStaffSession) => void) {
  const [jobs, setJobs] = useState<JobDTO[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [diagnostics, setDiagnostics] = useState<DiagnosticListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [queuedWrites, setQueuedWrites] = useState(0);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const syncRef = useRef<SyncService | null>(null);
  const refreshingRef = useRef(false);

  const loadCached = useCallback(async (): Promise<boolean> => {
    try {
      const packages = await syncRef.current?.listCachedPackages();
      if (!packages?.length) return false;

      setJobs(packages.map((item) => item.job as unknown as JobDTO));
      setAppointments(
        packages.flatMap((item) => {
          const appointment = packageToAppointment(item);
          return appointment ? [appointment] : [];
        }),
      );
      setDiagnostics(
        packages.flatMap((item) => {
          const diagnostic = packageToDiagnostic(item);
          return diagnostic ? [diagnostic] : [];
        }),
      );
      setQueuedWrites((await syncRef.current?.queuedCount()) ?? 0);
      setOffline(true);
      return true;
    } catch {
      // Local cache unavailable (e.g. database error) — treat as no cache.
      return false;
    }
  }, []);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [jobRows, appointmentRows, diagnosticRows, notifCount] = await Promise.all([
        fetchJson<JobDTO[]>(session, "/api/jobs", onSession),
        fetchJson<Appointment[]>(session, "/api/appointments", onSession),
        fetchJson<DiagnosticListItem[]>(session, "/api/diagnostics/sessions", onSession).catch(() => []),
        fetchUnreadNotificationCount(session).catch(() => ({ count: 0 })),
      ]);
      setJobs(jobRows);
      setAppointments(appointmentRows);
      setDiagnostics(diagnosticRows);
      setUnreadNotifications(notifCount.count);
      setOffline(false);
      setQueuedWrites((await syncRef.current?.queuedCount()) ?? 0);
    } catch (caught) {
      const restored = await loadCached();
      setError(
        restored
          ? "Offline mode — showing downloaded field packages. New readings remain queued until synchronization succeeds."
          : caught instanceof Error
            ? caught.message
            : String(caught),
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadCached, onSession, session]);

  const refresh = useCallback(
    async (options?: { silent?: boolean }) => {
      if (refreshingRef.current) return;
      refreshingRef.current = true;
      if (!options?.silent) setRefreshing(true);
      try {
        const service = syncRef.current;
        if (service) {
          const result = await service.pull();
          setLastSync(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
          setQueuedWrites(Math.max(0, (result?.queuedBeforeFlush ?? 0) - (result?.flushed ?? 0)));
        }
        await load();
      } catch {
        await loadCached();
      } finally {
        refreshingRef.current = false;
        if (!options?.silent) setRefreshing(false);
      }
    },
    [load, loadCached],
  );

  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    const service = new SyncService({ apiUrl: getApiUrl(), orgId: session.orgId, token: session.accessToken });
    syncRef.current = service;
    void loadRef.current();
    void refreshRef.current({ silent: true });

    const interval = setInterval(() => void refreshRef.current({ silent: true }), 60_000);
    return () => {
      clearInterval(interval);
      syncRef.current = null;
    };
  }, [session.accessToken, session.orgId]);

  const now = new Date();
  const todayStart = useMemo(() => new Date(now.getFullYear(), now.getMonth(), now.getDate()), [now.getDate(), now.getFullYear(), now.getMonth()]);
  const tomorrowStart = useMemo(() => {
    const d = new Date(todayStart);
    d.setDate(d.getDate() + 1);
    return d;
  }, [todayStart]);

  const todayAppointments = useMemo(
    () =>
      appointments
        .filter((appointment) => {
          const starts = new Date(appointment.startsAt);
          return starts >= todayStart && starts < tomorrowStart;
        })
        .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()),
    [appointments, todayStart, tomorrowStart],
  );

  const activeDiagnostics = useMemo(
    () =>
      diagnostics.filter((item) =>
        ["identification_required", "workflow_ready", "testing", "blocked", "escalated"].includes(item.session.status),
      ),
    [diagnostics],
  );

  const nextAppointment = todayAppointments.find((appointment) => new Date(appointment.endsAt) > now);
  const nextJob = nextAppointment ? jobs.find((job) => job.id === nextAppointment.jobId) : null;
  const nextDiagnostic = nextAppointment
    ? diagnostics.find((item) => item.session.jobId === nextAppointment.jobId)
    : null;

  const getSyncService = useCallback(() => syncRef.current, []);

  return {
    jobs,
    appointments,
    diagnostics,
    loading,
    refreshing,
    offline,
    error,
    lastSync,
    queuedWrites,
    unreadNotifications,
    todayAppointments,
    activeDiagnostics,
    nextAppointment,
    nextJob,
    nextDiagnostic,
    refresh,
    getSyncService,
  };
}

export function humanize(value: string) {
  return value.replaceAll("_", " ");
}

export function statusColor(status: string, colors: { danger: string; success: string; focus: string; warning: string }) {
  if (["blocked", "escalated", "suspended"].includes(status)) return colors.danger;
  if (["diagnosed", "completed"].includes(status)) return colors.success;
  if (["testing", "workflow_ready"].includes(status)) return colors.focus;
  return colors.warning;
}

/**
 * Accent color for a job lifecycle status. Mirrors the dashboard mapping:
 * in_progress -> warning (active), completed -> success, canceled -> danger,
 * lead -> muted, everything else (scheduled) -> primary.
 */
export function jobStatusTone(status: string, colors: { danger: string; success: string; warning: string; primary: string; dimForeground: string }): string {
  switch (status) {
    case "in_progress":
      return colors.warning;
    case "completed":
      return colors.success;
    case "canceled":
      return colors.danger;
    case "lead":
      return colors.dimForeground;
    default:
      return colors.primary;
  }
}

/** Soft tinted background that pairs with {@link jobStatusTone}. */
export function jobStatusToneBg(status: string, colors: { dangerAlpha: string; successAlpha: string; warningAlpha: string; primaryAlpha: string; surfaceMuted: string }): string {
  switch (status) {
    case "in_progress":
      return colors.warningAlpha;
    case "completed":
      return colors.successAlpha;
    case "canceled":
      return colors.dangerAlpha;
    case "lead":
      return colors.surfaceMuted;
    default:
      return colors.primaryAlpha;
  }
}
