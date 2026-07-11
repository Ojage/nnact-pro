import type { DispatchAppointment } from "./dispatch-api";

export function appointmentsOverlap(
  left: Pick<DispatchAppointment, "startsAt" | "endsAt">,
  right: Pick<DispatchAppointment, "startsAt" | "endsAt">,
) {
  const leftStart = new Date(left.startsAt).getTime();
  const leftEnd = new Date(left.endsAt).getTime();
  const rightStart = new Date(right.startsAt).getTime();
  const rightEnd = new Date(right.endsAt).getTime();

  return leftStart < rightEnd && rightStart < leftEnd;
}

export function conflictsForAppointment(
  appointment: DispatchAppointment,
  technicianId: string | null,
  appointments: DispatchAppointment[],
) {
  if (!technicianId) return [];

  return appointments.filter(
    (candidate) =>
      candidate.id !== appointment.id &&
      candidate.technicianId === technicianId &&
      appointmentsOverlap(appointment, candidate),
  );
}

export function buildConflictMap(appointments: DispatchAppointment[]) {
  const conflicts = new Map<string, Set<string>>();

  for (const appointment of appointments) {
    if (!appointment.technicianId) continue;
    const overlapping = conflictsForAppointment(appointment, appointment.technicianId, appointments);
    if (overlapping.length === 0) continue;

    const appointmentConflicts = conflicts.get(appointment.id) ?? new Set<string>();
    for (const candidate of overlapping) appointmentConflicts.add(candidate.id);
    conflicts.set(appointment.id, appointmentConflicts);
  }

  return conflicts;
}

export function countConflictPairs(conflictMap: Map<string, Set<string>>) {
  const uniquePairs = new Set<string>();

  for (const [appointmentId, conflictingIds] of conflictMap) {
    for (const conflictingId of conflictingIds) {
      uniquePairs.add([appointmentId, conflictingId].sort().join(":"));
    }
  }

  return uniquePairs.size;
}
