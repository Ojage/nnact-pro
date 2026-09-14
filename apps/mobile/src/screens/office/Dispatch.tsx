import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { formatMoney, type JobDTO, type UserDTO } from "@nnact/shared";
import type { StoredStaffSession } from "../../auth-storage";
import type { Appointment } from "../../hooks/useFieldData";
import { humanize, jobStatusTone as statusTone, jobStatusToneBg as statusToneBg } from "../../hooks/useFieldData";
import {
  createAppointment,
  listAppointments,
  listCustomers,
  listTeam,
  patchAppointment,
  patchJob,
  type OfficeAppointment,
} from "../../office-api";
import { DateField, TimeField } from "../../components/DateTimeFields";
import { UserAvatar } from "../../components/UserAvatar";
import { ActionButton, InlineError, OfficeHeader, Row, SectionLabel, Sheet, StatusTag, Tag } from "./shared";
import { fonts, spacing, type Palette } from "../../theme";

const DEFAULT_DURATION_MIN = 90;
const DURATION_OPTIONS = [30, 60, 90, 120];

function dayKey(offset: number) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setHours(0, 0, 0, 0);
  return d;
}

function fmtTime(iso: string | null | undefined) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtTimeShort(iso: string | null | undefined) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function DispatchScreen({
  colors,
  session,
  jobs,
  refreshing,
  onRefresh,
  onOpenJob,
  nav,
}: {
  colors: Palette;
  session: StoredStaffSession;
  jobs: JobDTO[];
  refreshing: boolean;
  onRefresh: () => void;
  onOpenJob: (jobId: string) => void;
  nav: { pop: () => void };
}) {
  const styles = createStyles(colors);
  const [dayOffset, setDayOffset] = useState(0);
  const [appointments, setAppointments] = useState<OfficeAppointment[]>([]);
  const [team, setTeam] = useState<UserDTO[]>([]);
  const [customerNames, setCustomerNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionsJobId, setActionsJobId] = useState<string | null>(null);
  const [assignFor, setAssignFor] = useState<string | null>(null);
  const [scheduleFor, setScheduleFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [apptRows, teamRows, customers] = await Promise.all([
        listAppointments(session),
        listTeam(session),
        listCustomers(session),
      ]);
      setAppointments(apptRows);
      setTeam(teamRows);
      setCustomerNames(Object.fromEntries(customers.map((c) => [c.id, c.name])));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedDay = useMemo(() => dayKey(dayOffset).toDateString(), [dayOffset]);

  const dayAppointments = useMemo(
    () => appointments.filter((a) => new Date(a.startsAt).toDateString() === selectedDay).sort((a, b) => (new Date(a.startsAt) > new Date(b.startsAt) ? 1 : -1)),
    [appointments, selectedDay],
  );

  const unassignedJobs = useMemo(
    () =>
      jobs
        .filter((j) => !["completed", "canceled"].includes(j.status))
        .filter((j) => !j.scheduledAt)
        .sort((a, b) =>
          (a.preferredDate ?? a.createdAt).localeCompare(b.preferredDate ?? b.createdAt),
        ),
    [jobs],
  );

  const openJobs = useMemo(
    () => jobs.filter((j) => !["completed", "canceled"].includes(j.status)).length,
    [jobs],
  );

  const actionsJob = actionsJobId ? jobs.find((j) => j.id === actionsJobId) ?? null : null;
  const actionsAppointment = actionsJobId
    ? appointments.find((a) => a.jobId === actionsJobId) ?? null
    : null;
  const assignee = actionsJob
    ? team.find((t) => t.id === (actionsAppointment?.technicianId ?? actionsJob.assignedTo))
    : null;

  const technicianOptions = useMemo(
    () =>
      team.filter(
        (t) => t.active && (t.role === "technician" || t.role === "owner"),
      ),
    [team],
  );

  async function runAction(fn: () => Promise<unknown>) {
    try {
      await fn();
      setError(null);
      setActionsJobId(null);
      setAssignFor(null);
      setScheduleFor(null);
      onRefresh();
      await load();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      return false;
    }
  }

  async function assign(job: JobDTO, technicianId: string) {
    const appointment = appointments.find((a) => a.jobId === job.id);
    const started = appointment
      ? appointment.startsAt
      : job.scheduledAt ?? nextDefaultSlot().toISOString();
    const startsAt = new Date(started);
    const endsAt = new Date(startsAt.getTime() + DEFAULT_DURATION_MIN * 60_000);
    await runAction(async () => {
      if (appointment) {
        await patchAppointment(session, appointment.id, {
          technicianId,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
        });
      } else {
        await createAppointment(session, {
          jobId: job.id,
          technicianId,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
        });
      }
    });
  }

  async function reschedule(job: JobDTO, startsAtIso: string, durationMin: number) {
    const endsAt = new Date(new Date(startsAtIso).getTime() + durationMin * 60_000);
    const appointment = appointments.find((a) => a.jobId === job.id);
    await runAction(async () => {
      if (appointment) {
        await patchAppointment(session, appointment.id, {
          startsAt: startsAtIso,
          endsAt: endsAt.toISOString(),
        });
      } else {
        await createAppointment(session, {
          jobId: job.id,
          startsAt: startsAtIso,
          endsAt: endsAt.toISOString(),
        });
      }
    });
  }

  async function setStatus(job: JobDTO, status: JobDTO["status"]) {
    await runAction(async () => {
      await patchJob(session, job.id, { status });
    });
  }

  const dayLabel = dayOffset === 0 ? "Today" : dayOffset === 1 ? "Tomorrow" : dayOffset === -1 ? "Yesterday" : selectedDay;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} progressBackgroundColor={colors.surface} />
      }
    >
      <OfficeHeader
        colors={colors}
        eyebrow="Dispatch"
        title="Schedule"
        subtitle="Assign, schedule and move jobs across the field team."
        onBack={nav.pop}
      />

      <InlineError colors={colors} message={error} />

      <View style={styles.dayNav}>
        <TouchableOpacity onPress={() => setDayOffset((o) => Math.max(-14, o - 1))} style={styles.dayArrow} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={18} color={colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setDayOffset(0)} activeOpacity={0.8}>
          <Text style={styles.dayLabel}>{dayLabel}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setDayOffset((o) => Math.min(30, o + 1))} style={styles.dayArrow} activeOpacity={0.7}>
          <Ionicons name="chevron-forward" size={18} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <SectionLabel colors={colors}>Visits for {dayLabel.toLowerCase()}</SectionLabel>
      {loading ? (
        <Text style={styles.mutedNote}>Loading schedule…</Text>
      ) : dayAppointments.length === 0 ? (
        <Text style={styles.mutedNote}>No visits scheduled this day.</Text>
      ) : (
        dayAppointments.map((appointment) => {
          const job = jobs.find((j) => j.id === appointment.jobId);
          const tech = team.find((t) => t.id === appointment.technicianId);
          return (
            <Row
              key={appointment.id}
              colors={colors}
              avatar={tech ? <UserAvatar colors={colors} name={tech.name} uri={tech.profilePictureUrl} size={38} /> : undefined}
              icon={tech ? undefined : "calendar-clear-outline"}
              title={job?.title ?? "Service job"}
              subtitle={`${fmtTimeShort(appointment.startsAt)} · ${customerNames[job?.customerId ?? ""] ?? "Customer"}${tech ? ` · ${tech.name}` : ""}`}
              onPress={() => setActionsJobId(appointment.jobId)}
            />
          );
        })
      )}

      <SectionLabel colors={colors}>
        Unassigned · <Text style={{ color: colors.danger }}>{unassignedJobs.length}</Text>
        <Text style={{ color: colors.dimForeground }}>   Open jobs · {openJobs}</Text>
      </SectionLabel>
      {unassignedJobs.length === 0 ? (
        <Text style={styles.mutedNote}>Nothing in the unassigned queue.</Text>
      ) : (
        unassignedJobs.map((job) => (
          <Row
            key={job.id}
            colors={colors}
            icon="person-add-outline"
            title={job.title}
            subtitle={`${customerNames[job.customerId] ?? "Customer"} · ${formatMoney(job.total)}${job.preferredDate ? ` · wanted ${job.preferredDate}` : ""}`}
            right={<Tag colors={colors} label="Unassigned" tone="warning" />}
            onPress={() => setActionsJobId(job.id)}
          />
        ))
      )}

      {actionsJob ? (
        <Sheet colors={colors} visible title="Dispatch actions" onClose={() => setActionsJobId(null)}>
          <View style={styles.jobSheetHeader}>
            <Text style={styles.jobSheetTitle}>{actionsJob.title}</Text>
            <StatusTag colors={colors} status={actionsJob.status} />
            <Text style={styles.jobSheetMeta}>
              {fmtTime(actionsJob.scheduledAt) ?? "Not scheduled"}
              {assignee ? ` · ${assignee.name}` : " · Unassigned"}
            </Text>
          </View>
          <ActionButton colors={colors} label="Assign technician" icon="person-add-outline" onPress={() => setAssignFor(actionsJob.id)} />
          <ActionButton colors={colors} label="Set schedule & time" icon="calendar-outline" onPress={() => setScheduleFor(actionsJob.id)} />
          {actionsJob.status === "scheduled" ? (
            <ActionButton colors={colors} label="Mark in progress" icon="play-outline" tone="primary" onPress={() => void setStatus(actionsJob, "in_progress")} />
          ) : null}
          {actionsJob.status === "in_progress" ? (
            <ActionButton colors={colors} label="Complete job" icon="checkmark-done-outline" tone="success" onPress={() => void setStatus(actionsJob, "completed")} />
          ) : null}
          {!["completed", "canceled"].includes(actionsJob.status) ? (
            <ActionButton colors={colors} label="Cancel job" icon="close-outline" tone="danger" onPress={() => void setStatus(actionsJob, "canceled")} />
          ) : null}
          <ActionButton
            colors={colors}
            label="Open full job record"
            icon="open-outline"
            onPress={() => {
              setActionsJobId(null);
              onOpenJob(actionsJob.id);
            }}
          />
        </Sheet>
      ) : null}

      {assignFor ? (
        <Sheet colors={colors} visible title="Assign technician" onClose={() => setAssignFor(null)}>
          <Text style={styles.sheetHint}>Who should take the {jobs.find((j) => j.id === assignFor)?.title ?? "job"}?</Text>
          {technicianOptions.map((tech) => (
            <Row
              key={tech.id}
              colors={colors}
              avatar={<UserAvatar colors={colors} name={tech.name} uri={tech.profilePictureUrl} size={38} />}
              title={tech.name}
              subtitle={[humanize(tech.role), tech.title].filter(Boolean).join(" · ")}
              onPress={() => void assign(jobs.find((j) => j.id === assignFor)!, tech.id)}
            />
          ))}
        </Sheet>
      ) : null}

      {scheduleFor ? <ScheduleSheet colors={colors} job={jobs.find((j) => j.id === scheduleFor)!} onCancel={() => setScheduleFor(null)} onSubmit={(iso, minutes) => void reschedule(jobs.find((j) => j.id === scheduleFor)!, iso, minutes)} /> : null}
    </ScrollView>
  );
}

function nextDefaultSlot(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d;
}

function ScheduleSheet({
  colors,
  job,
  onCancel,
  onSubmit,
}: {
  colors: Palette;
  job: JobDTO;
  onCancel: () => void;
  onSubmit: (iso: string, durationMin: number) => void;
}) {
  const defaultStart = job.scheduledAt ? new Date(job.scheduledAt) : nextDefaultSlot();
  const [startsAt, setStartsAt] = useState(defaultStart);
  const [durationMin, setDurationMin] = useState(DEFAULT_DURATION_MIN);
  const [error, setError] = useState<string | null>(null);
  const styles = createStyles(colors);
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const endTime = useMemo(() => new Date(startsAt.getTime() + durationMin * 60_000), [startsAt, durationMin]);

  function changeDate(next: Date) {
    const merged = new Date(next);
    merged.setHours(startsAt.getHours(), startsAt.getMinutes(), 0, 0);
    setStartsAt(merged);
    setError(null);
  }

  function changeTime(next: Date) {
    const merged = new Date(startsAt);
    merged.setHours(next.getHours(), next.getMinutes(), 0, 0);
    setStartsAt(merged);
    setError(null);
  }

  return (
    <Sheet colors={colors} visible title="Set schedule" onClose={onCancel}>
      <Text style={styles.sheetHint}>{job.title}</Text>
      <DateField colors={colors} label="Date" value={startsAt} onChange={changeDate} minimumDate={today} />
      <TimeField colors={colors} label="Start time" value={startsAt} onChange={changeTime} minuteInterval={15} />
      <Text style={styles.fieldLabel}>Duration</Text>
      <View style={styles.durationRow}>
        {DURATION_OPTIONS.map((minutes) => (
          <TouchableOpacity
            key={minutes}
            style={[styles.durationChip, durationMin === minutes && { backgroundColor: colors.primary }]}
            onPress={() => setDurationMin(minutes)}
            activeOpacity={0.8}
          >
            <Text style={[styles.durationChipText, { color: durationMin === minutes ? colors.onEmphasis : colors.mutedForeground }]}>
              {minutes} min
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.durationEnd}>
        Ends at{" "}
        {endTime.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
      </Text>
      <InlineError colors={colors} message={error} />
      <View style={styles.sheetActions}>
        <TouchableOpacity style={[styles.sheetActionBtn, { backgroundColor: colors.surfaceMuted }]} onPress={onCancel} activeOpacity={0.8}>
          <Text style={[styles.sheetActionText, { color: colors.foreground }]}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.sheetActionBtn, { backgroundColor: colors.primary }]}
          onPress={() => {
            if (startsAt.getTime() < Date.now() - 60_000) {
              setError("The start time is in the past.");
              return;
            }
            onSubmit(startsAt.toISOString(), durationMin);
          }}
          activeOpacity={0.8}
        >
          <Text style={[styles.sheetActionText, { color: colors.onEmphasis }]}>Save schedule</Text>
        </TouchableOpacity>
      </View>
    </Sheet>
  );
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    scroll: { flex: 1, backgroundColor: colors.background },
    content: { paddingBottom: spacing.xl },
    dayNav: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginHorizontal: spacing.lg,
      marginBottom: spacing.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.borderLight,
      borderRadius: 14,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
    },
    dayArrow: { padding: spacing.xs },
    dayLabel: { color: colors.foreground, fontSize: 15, fontFamily: fonts.bold },
    mutedNote: { color: colors.dimForeground, fontSize: 13, fontFamily: fonts.regular, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
    jobSheetHeader: { marginBottom: spacing.sm, gap: 6 },
    jobSheetTitle: { color: colors.foreground, fontSize: 16, fontFamily: fonts.bold },
    jobSheetMeta: { color: colors.dimForeground, fontSize: 13, fontFamily: fonts.regular },
    sheetHint: { color: colors.mutedForeground, fontSize: 13, fontFamily: fonts.regular, marginBottom: spacing.sm },
    fieldLabel: { color: colors.mutedForeground, fontSize: 12, fontFamily: fonts.semibold, marginTop: spacing.sm, marginBottom: 6 },
    durationRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginBottom: spacing.xs },
    durationChip: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: colors.surfaceMuted },
    durationChipText: { fontSize: 12, fontFamily: fonts.semibold },
    durationEnd: { color: colors.dimForeground, fontSize: 13, fontFamily: fonts.regular, marginBottom: spacing.sm },
    sheetActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
    sheetActionBtn: { flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 12 },
    sheetActionText: { fontSize: 14, fontFamily: fonts.bold },
  });