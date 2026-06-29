/* ponytail: lightweight RRULE parser — handles the common recurrence patterns
   field-service jobs need (daily/weekly/monthly). No library dep.
   Ceiling: no BYSETPOS, no EXDATE, no WKST, no timezone-aware UNTIL.
   Upgrade: install rrule.js when complex recurrence is needed. */

export interface ParsedRRule {
  freq: "DAILY" | "WEEKLY" | "MONTHLY";
  interval: number;
  byDay?: string[];   /* MO,TU,WE,TH,FR,SA,SU */
  byMonthDay?: number[];
  count?: number;
  until?: Date;
}

/** Parse an RFC 5545 RRULE string into its components. */
export function parseRRule(rrule: string): ParsedRRule | null {
  try {
    const parts = rrule.split(";").map((p) => p.trim());
    const map = new Map<string, string>();
    for (const p of parts) {
      const eq = p.indexOf("=");
      if (eq === -1) continue;
      map.set(p.slice(0, eq).toUpperCase(), p.slice(eq + 1));
    }

    const freq = map.get("FREQ")?.toUpperCase();
    if (!freq || !["DAILY", "WEEKLY", "MONTHLY"].includes(freq)) return null;

    const interval = parseInt(map.get("INTERVAL") ?? "1", 10) || 1;
    const byDay = map.get("BYDAY")?.split(",").map((d) => d.trim().toUpperCase());
    const byMonthDay = map.get("BYMONTHDAY")?.split(",").map(Number);
    const count = map.has("COUNT") ? parseInt(map.get("COUNT")!, 10) || undefined : undefined;
    const untilRaw = map.get("UNTIL");
    let until: Date | undefined;
    if (untilRaw) {
      /* UNTIL=YYYYMMDD or YYYYMMDDTHHMMSSZ */
      const cleaned = untilRaw.replace(/[^0-9]/g, "");
      const y = +cleaned.slice(0, 4);
      const m = +cleaned.slice(4, 6) - 1;
      const d = +cleaned.slice(6, 8);
      until = new Date(Date.UTC(y, m, d));
    }

    return {
      freq: freq as ParsedRRule["freq"],
      interval: Math.max(1, interval),
      ...(byDay ? { byDay } : {}),
      ...(byMonthDay ? { byMonthDay } : {}),
      ...(count ? { count } : {}),
      ...(until ? { until } : {}),
    };
  } catch {
    return null;
  }
}

const DAY_MAP: Record<string, number> = {
  MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 0,
};

/** Expand a parsed RRULE into concrete dates within [rangeStart, rangeEnd).
 *  startDate is the template's first occurrence (nextRunAt). */
export function expandRRule(
  parsed: ParsedRRule,
  startDate: Date,
  rangeStart: Date,
  rangeEnd: Date,
): Date[] {
  const results: Date[] = [];
  let cursor = new Date(startDate);
  let generated = 0;

  /* safety cap to prevent infinite loops from broken rules */
  const MAX = parsed.count ?? 200;

  while (cursor < rangeEnd && generated < MAX) {
    if (parsed.until && cursor > parsed.until) break;
    if (parsed.count && generated >= parsed.count) break;

    if (cursor >= rangeStart) {
      results.push(new Date(cursor));
      generated++;
    }

    cursor = advance(cursor, parsed);
  }

  return results;
}

function advance(current: Date, parsed: ParsedRRule): Date {
  const d = new Date(current);

  switch (parsed.freq) {
    case "DAILY":
      d.setDate(d.getDate() + parsed.interval);
      return d;

    case "WEEKLY": {
      const byDay = parsed.byDay ?? [WEEKDAY_ABBR[d.getDay() === 0 ? 6 : d.getDay() - 1]];
      /* Sort BYDAY by day-of-week, find the current day's index, advance to next */
      const sorted = [...byDay].sort((a, b) => {
        const va = DAY_MAP[a] ?? 0;
        const vb = DAY_MAP[b] ?? 0;
        return va - vb;
      });
      const currentDow = d.getDay(); /* 0=Sun, 1=Mon */
      const currentIndex = sorted.findIndex((bd) => {
        const dow = DAY_MAP[bd] ?? 0;
        return dow === currentDow;
      });

      if (currentIndex === -1) {
        /* current day not in BYDAY — find the next BYDAY in this week first */
        let foundThisWeek = false;
        for (const bd of sorted) {
          const bdDow = DAY_MAP[bd] ?? 0;
          if (bdDow > currentDow) {
            d.setDate(d.getDate() + (bdDow - currentDow));
            foundThisWeek = true;
            break;
          }
        }
        if (!foundThisWeek) {
          /* no BYDAY later this week — jump to first BYDAY of next interval week */
          d.setDate(d.getDate() + parsed.interval * 7);
          const targetDow = DAY_MAP[sorted[0]] ?? 1;
          let daysToFirst = targetDow - d.getDay();
          if (daysToFirst < 0) daysToFirst += 7;
          d.setDate(d.getDate() + daysToFirst);
        }
      } else if (currentIndex === sorted.length - 1) {
        /* last BYDAY of this week → jump to first BYDAY of next interval week.
           First advance to Monday of the target week, then find the first BYDAY. */
        const daysToNextMonday = (8 - currentDow) % 7 || 7;
        d.setDate(d.getDate() + daysToNextMonday + (parsed.interval - 1) * 7);
        const targetDow = DAY_MAP[sorted[0]] ?? 1;
        const currentStartDow = d.getDay();
        let daysToFirst = targetDow - currentStartDow;
        if (daysToFirst < 0) daysToFirst += 7;
        d.setDate(d.getDate() + daysToFirst);
      } else {
        /* next BYDAY within same week */
        const nextDow = DAY_MAP[sorted[currentIndex + 1]] ?? 1;
        let daysToNext = nextDow - currentDow;
        if (daysToNext <= 0) daysToNext += 7;
        d.setDate(d.getDate() + daysToNext);
      }
      return d;
    }

    case "MONTHLY": {
      if (parsed.byMonthDay) {
        /* e.g. BYMONTHDAY=15 → every month on the 15th */
        const targetDay = Math.min(parsed.byMonthDay[0], 28);
        d.setMonth(d.getMonth() + parsed.interval);
        d.setDate(targetDay);
      } else if (parsed.byDay) {
        /* e.g. BYDAY=3MO → 3rd Monday. Format: N+/-N + weekday */
        const spec = parsed.byDay[0];
        const match = spec.match(/^(-?\d+)?([A-Z]{2})$/);
        if (!match) {
          d.setMonth(d.getMonth() + parsed.interval);
          return d;
        }
        const nth = parseInt(match[1] || "1", 10);
        const wd = DAY_MAP[match[2]] ?? 1;
        d.setMonth(d.getMonth() + parsed.interval);
        d.setDate(1);
        /* find the nth occurrence of the weekday in this month */
        const firstDow = d.getDay();
        let dayOfFirst = wd - firstDow;
        if (dayOfFirst < 0) dayOfFirst += 7;
        const nthDay = 1 + dayOfFirst + (nth > 0 ? (nth - 1) * 7 : 0);
        d.setDate(Math.min(nthDay, daysInMonth(d.getFullYear(), d.getMonth())));
      } else {
        d.setMonth(d.getMonth() + parsed.interval);
      }
      return d;
    }

    default:
      d.setDate(d.getDate() + parsed.interval);
      return d;
  }
}

const WEEKDAY_ABBR = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

function daysInMonth(y: number, m: number): number {
  return new Date(y, m + 1, 0).getDate();
}
