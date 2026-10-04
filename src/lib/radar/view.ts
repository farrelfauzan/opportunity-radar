import { formatDateShortWib, formatTimeWib } from "@/i18n/format";
import type { Locale } from "@/i18n/locales";
import { fill, type Messages } from "@/i18n/t";
import { isStale } from "@/lib/opportunities/view";

/** The singular or plural form of a counted phrase ("{n} article" / "{n} articles"). */
export const plural = (count: number, forms: { one: string; other: string }) =>
  fill(count === 1 ? forms.one : forms.other, { n: count });

/** "2 opportunities affected" for a brief line; null when the line affects none (then nothing is shown). */
export function affectedText(count: number, strings: Messages["radar"]["brief"]["affected"]): string | null {
  return count > 0 ? plural(count, strings) : null;
}

/** The brief's footer: "AI summary of 112 articles from 14 sources". */
export function briefSourceText(articleCount: number, sourceCount: number, strings: Messages["radar"]["brief"]): string {
  return fill(strings.source, {
    articles: plural(articleCount, strings.articles),
    sources: plural(sourceCount, strings.sources),
  });
}

/** "Saturday, 3 October 2026 · updated 07:00 WIB"; just the date when no morning run is on record. */
export function updatedText(date: string, time: string | null, template: string): string {
  return time === null ? date : fill(template, { date, time });
}

/**
 * "The daily brief last updated 3 Oct, 07:00 WIB" for a section whose last successful run is more than 26 hours
 * old; null while it is fresh or has never run (nothing to say yet). A run that old is always on an earlier WIB
 * day, so only the dated form applies. `what` is the section's name (state.stale.what.*).
 */
export function sectionStale(
  lastRun: Date | null,
  now: Date,
  locale: Locale,
  strings: Messages["state"]["stale"],
  what: "brief" | "opportunities",
): string | null {
  if (!isStale(lastRun, now)) return null;
  return fill(strings.earlier, {
    what: strings.what[what],
    date: formatDateShortWib(lastRun!, locale),
    time: formatTimeWib(lastRun!, locale),
  });
}

/** The time of the first morning run, 07:00 WIB, written the way the locale writes a time. */
export function firstRunTime(locale: Locale): string {
  return formatTimeWib(new Date("2026-01-01T00:00:00Z"), locale); // 00:00 UTC is 07:00 WIB
}
