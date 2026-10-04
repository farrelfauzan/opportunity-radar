// The 30-day trend of an opportunity's score. Pure (no database) so it can be unit tested.
// Rule (OR-16, docs/design/copy.md section 10.1): the trend is the current score minus the
// score of the nearest score row on or before today - 30 days. An opportunity first scored
// fewer than 30 days ago (day 0 to 29 since its first score) has no 30-day change yet: "new".

export const TREND_DAYS = 30;

export type Trend = { kind: "new" } | { kind: "change"; delta: number };

const DAY_MS = 24 * 60 * 60 * 1000;

const utcMs = (day: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("day must be YYYY-MM-DD");
  return Date.parse(`${day}T00:00:00Z`);
};

/** A calendar day (YYYY-MM-DD) plus `days`; days are plain calendar days, with no time zone. */
export function addDays(day: string, days: number): string {
  return new Date(utcMs(day) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole calendar days from `from` to `to` (both YYYY-MM-DD). */
export function daysBetween(from: string, to: string): number {
  return Math.round((utcMs(to) - utcMs(from)) / DAY_MS);
}

/**
 * @param today     the WIB day the list is read on
 * @param firstDay  the day of the opportunity's first score row
 * @param latest    the current (newest) overall score
 * @param baseline  the overall score of the nearest row on or before today - 30 days, or null if none
 */
export function computeTrend(input: {
  today: string;
  firstDay: string | null;
  latest: number;
  baseline: number | null;
}): Trend {
  const { today, firstDay, latest, baseline } = input;
  if (firstDay === null || baseline === null || daysBetween(firstDay, today) < TREND_DAYS) return { kind: "new" };
  return { kind: "change", delta: latest - baseline };
}
