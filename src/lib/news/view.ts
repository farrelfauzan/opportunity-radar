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

/** Latest-run statuses that count as updated: a fetched feed ("200") and an unchanged one ("304", a successful check). */
const UPDATED_STATUSES = ["200", "304", "ok"];

type SourceStatus = { slug: string; name: string; lastStatus: string | null };

/**
 * The partial state: the news is not stale, yet at least one active source did not update on the
 * latest run (its status is not 200 / 304). A source with no run on record is not counted: nothing
 * says it failed. `health` holds active sources only. Null when everything is fine or the news is
 * stale (the stale banner speaks then).
 */
export function partialState(
  health: SourceStatus[],
  stale: boolean,
): { ok: number; total: number; failed: SourceStatus[] } | null {
  if (stale) return null;
  const failed = health.filter((s) => s.lastStatus !== null && !UPDATED_STATUSES.includes(s.lastStatus));
  if (failed.length === 0) return null;
  return { ok: health.length - failed.length, total: health.length, failed };
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

/** The articles an open opportunity cites (what "Only news linked to an opportunity" keeps), in their order. */
export function onlyLinked<T extends { id: number }>(list: T[], enrichment: Map<number, { linked: unknown }>): T[] {
  return list.filter((article) => enrichment.get(article.id)?.linked != null);
}

/** Width of a theme bar in percent: the count against the biggest count, so the top theme fills the track. */
export function themeBarPercent(count: number, max: number): number {
  return max > 0 ? Math.min(100, Math.max(0, Math.round((count / max) * 100))) : 0;
}
