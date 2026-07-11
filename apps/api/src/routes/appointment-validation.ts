export interface AppointmentWindow {
  startsAt: Date;
  endsAt: Date;
}

export interface AppointmentWindowPatch {
  startsAt?: string;
  endsAt?: string;
}

export type AppointmentWindowResult =
  | { ok: true; startsAt: Date; endsAt: Date }
  | { ok: false; error: string };

/**
 * Resolves a partial appointment-time patch against the persisted window and
 * validates the resulting interval. The API must validate the final combined
 * state, not only a pair of values supplied in the same request.
 */
export function resolveAppointmentWindow(
  current: AppointmentWindow,
  patch: AppointmentWindowPatch,
): AppointmentWindowResult {
  const startsAt = patch.startsAt ? new Date(patch.startsAt) : current.startsAt;
  const endsAt = patch.endsAt ? new Date(patch.endsAt) : current.endsAt;

  if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime())) {
    return { ok: false, error: "startsAt and endsAt must be valid datetimes" };
  }

  if (endsAt <= startsAt) {
    return { ok: false, error: "endsAt must be after startsAt" };
  }

  return { ok: true, startsAt, endsAt };
}
