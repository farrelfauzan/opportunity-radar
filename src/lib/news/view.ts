import { wibDay } from "@/server/data";
import { formatDateShortWib, formatTimeWib } from "@/i18n/format";
import type { Locale } from "@/i18n/locales";
import { fill, type Messages } from "@/i18n/t";

/** The job whose last successful run says how fresh the news is. */
export const INGEST_JOB = "ingest-news";

export const STALE_AFTER_MS = 2 * 60 * 60 * 1000;

/** Older than 2 hours (exactly 2 hours is still fresh). No run at all is not "stale": see isNeverIngested. */
export function isStale(lastRun: Date | null, now: Date): boolean {
  return lastRun !== null && now.getTime() - lastRun.getTime() > STALE_AFTER_MS;
}

/** No successful ingestion ever and nothing stored for today. */
export function isNeverIngested(lastRun: Date | null, articlesToday: number): boolean {
  return lastRun === null && articlesToday === 0;
}

/** The stale banner text, or null while the news is fresh. */
export function staleBanner(
  lastRun: Date | null,
  now: Date,
  locale: Locale,
  strings: Messages["state"]["stale"],
): string | null {
  if (!lastRun || !isStale(lastRun, now)) return null;
  const values = { what: strings.what.news, time: formatTimeWib(lastRun, locale) };
  return wibDay(lastRun) === wibDay(now)
    ? fill(strings.today, values)
    : fill(strings.earlier, { ...values, date: formatDateShortWib(lastRun, locale) });
}

/** The link as an absolute http(s) URL, or null (javascript:, data:, relative or malformed links). */
export function safeHref(link: string): string | null {
  try {
    const url = new URL(link);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}
