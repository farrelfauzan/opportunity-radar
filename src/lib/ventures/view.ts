import { formatDateShortWib } from "@/i18n/format";
import type { Locale } from "@/i18n/locales";
import { fill, type Messages } from "@/i18n/t";
import { sparklinePoints } from "@/lib/market/view";
import { trendText } from "@/lib/opportunities/view";
import { plural } from "@/lib/radar/view";
import { addDays, wibDay, type MarketPoint, type VentureProgress } from "@/server/data";

/** The progress as a whole percent for the bar and its label: clamped to 0–100 (the table also checks it). */
export const progressPercent = (percent: number) => Math.min(100, Math.max(0, Math.round(percent)));

/**
 * The change of a market score vs yesterday as "▲ 5", "▼ 2" or "— 0" (with its direction); null when there is
 * no change to say (the day before has no row, or either score is missing): the score is then shown alone.
 */
export function scoreChange(delta: number | null, strings: Messages["opp"]["trend"]) {
  return delta === null ? null : trendText({ kind: "change", delta }, strings);
}

/** No market row at all and no winds: the venture has not been scored yet (not "no related news"). */
export const neverScored = (market: { indonesia: unknown; global: unknown }, winds: unknown) =>
  market.indonesia === null && market.global === null && winds === null;

/**
 * The change of a score as spoken text: "up 5 points vs yesterday", "down 1 point vs yesterday" or "unchanged vs
 * yesterday" (the unit is score points, never percent). The visible "▲ 5" is aria-hidden and this is its label.
 */
export function deltaLabel(delta: number, strings: Messages["radar"]["ventures"]): string {
  if (delta > 0) return plural(delta, strings.deltaUp);
  if (delta < 0) return plural(-delta, strings.deltaDown);
  return strings.deltaFlat;
}

/**
 * "As of 3 Oct" for a score whose WIB day (YYYY-MM-DD) is neither today nor yesterday; null for those two. An old
 * row stays the newest one after a missed morning, so it must not look current.
 */
export function scoreAsOf(day: string, now: Date, locale: Locale, template: string): string | null {
  const today = wibDay(now);
  if (day === today || day === addDays(today, -1)) return null;
  return fill(template, { date: formatDateShortWib(new Date(`${day}T12:00:00+07:00`), locale) });
}

/**
 * "Sprint 3 delivered · Next: sprint 4 · 4 tickets in QA": the parts the progress row has data for, joined with
 * " · "; null when it has none (then no sentence is shown).
 */
export function progressSentence(
  progress: Pick<VentureProgress, "sprintDelivered" | "sprintNext" | "ticketsInQa">,
  strings: Messages["venture"]["progress"],
): string | null {
  const parts = [
    progress.sprintDelivered !== null && fill(strings.delivered, { n: progress.sprintDelivered }),
    progress.sprintNext !== null && fill(strings.next, { n: progress.sprintNext }),
    progress.ticketsInQa !== null && plural(progress.ticketsInQa, strings.inQa),
  ].filter((part): part is string => part !== false);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** What each `ventures.progress_source` value is called on screen. */
export const progressSourceName = { notion: "Notion" } as const;

/**
 * The 30-day score line of one region: the polyline points (96 × 28, scaled to the series' own range) and the hidden
 * text summary "Last 12 days: from 70 to 76" counting the points drawn. Both null under 2 points: nothing to draw.
 */
export function seriesView(points: MarketPoint[], strings: Messages["venture"]["market"]): { points: string; summary: string } | null {
  const drawn = sparklinePoints(points.map((p) => p.score));
  if (drawn === null) return null;
  return { points: drawn, summary: fill(strings.trend, { n: points.length, first: points[0].score, last: points[points.length - 1].score }) };
}

/** Related news shown at first, and added by each "Load more". */
export const NEWS_PAGE_SIZE = 20;
const MAX_SHOWN = 1000;

/** ?shown=: how many related news to list. Anything that is not a whole number falls back to the first page. */
export function parseShown(value: string | string[] | undefined): number {
  const shown = typeof value === "string" && /^\d{1,4}$/.test(value) ? Number(value) : 0;
  return Math.min(Math.max(shown, NEWS_PAGE_SIZE), MAX_SHOWN);
}

/** The venture view's URL; the first page's `shown` is left out. */
export function ventureHref(locale: Locale, slug: string, shown = NEWS_PAGE_SIZE): string {
  return `/${locale}/ventures/${slug}${shown > NEWS_PAGE_SIZE ? `?shown=${shown}` : ""}`;
}
