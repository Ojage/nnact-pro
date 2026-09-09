// Pure recurrence math for recurring job templates. Testable without a DB.

/** Next run timestamp after materializing one occurrence. */
export function nextOccurrence(current: Date, intervalDays: number): Date {
  if (intervalDays <= 0) throw new Error("intervalDays must be positive");
  return new Date(current.getTime() + intervalDays * 86_400_000);
}

/** Is a template due to materialize at `now`? */
export function isDue(nextRunAt: Date, now: Date): boolean {
  return nextRunAt.getTime() <= now.getTime();
}

/**
 * Catch up a template that's overdue: returns how many occurrences are due and
 * the new nextRunAt. Caps the count so a long-dormant template can't spawn
 * hundreds of jobs at once. ponytail: cap=12; raise if a real cadence needs it.
 */
export function catchUp(nextRunAt: Date, intervalDays: number, now: Date, cap = 12): { due: number; next: Date } {
  let due = 0;
  let next = nextRunAt;
  while (isDue(next, now) && due < cap) {
    due++;
    next = nextOccurrence(next, intervalDays);
  }
  return { due, next };
}
