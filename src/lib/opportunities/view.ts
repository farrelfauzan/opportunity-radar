import type { Horizon, Opportunity, OpportunityScore, Trend } from "@/server/data";
import { formatDateShortWib, formatTimeWib } from "@/i18n/format";
import type { Locale } from "@/i18n/locales";
import { fill, type Messages } from "@/i18n/t";

/** Scores are written once a morning: older than 26 hours means a run was missed (docs/design/copy.md 2.3). */
export const STALE_AFTER_MS = 26 * 60 * 60 * 1000;

/** Older than 26 hours (exactly 26 hours is still fresh). No run at all is not "stale": see isNeverScored. */
export function isStale(lastRun: Date | null, now: Date): boolean {
  return lastRun !== null && now.getTime() - lastRun.getTime() > STALE_AFTER_MS;
}

/** No scoring run ever and no opportunity stored. */
export function isNeverScored(lastRun: Date | null, openCount: number): boolean {
  return lastRun === null && openCount === 0;
}

/** The stale banner text, or null while the scores are fresh. */
export function staleBanner(
  lastRun: Date | null,
  now: Date,
  locale: Locale,
  strings: Messages["state"]["stale"],
): string | null {
  if (!lastRun || !isStale(lastRun, now)) return null;
  // More than 26 hours ago is always an earlier WIB day, so only the dated form (state.stale.earlier) applies.
  return fill(strings.earlier, {
    what: strings.what.opportunities,
    date: formatDateShortWib(lastRun, locale),
    time: formatTimeWib(lastRun, locale),
  });
}

/** The trend as text: "▲ 9", "▼ 3", "— 0" or "New". Always a symbol or a word, never only a colour. */
export function trendText(trend: Trend, strings: Messages["opp"]["trend"]): { text: string; direction: "up" | "down" | "flat" | "new" } {
  if (trend.kind === "new") return { text: strings.new, direction: "new" };
  if (trend.delta > 0) return { text: fill(strings.up, { n: trend.delta }), direction: "up" };
  if (trend.delta < 0) return { text: fill(strings.down, { n: -trend.delta }), direction: "down" };
  return { text: strings.flat, direction: "flat" };
}

/** The dictionary key of each horizon value (opp.horizon.*). */
export const horizonKey = { "0-6m": "short", "6-12m": "mid", "1-3y": "long" } as const satisfies Record<
  Horizon,
  keyof Messages["opp"]["horizon"]
>;

/** The text of a bilingual pair of columns, in the language of the page. */
export const inLocale = (locale: Locale, en: string, id: string) => (locale === "id" ? id : en);

/** "Indonesia · Logistics & Supply Chain, Fisheries & Maritime · Horizon 6–12 months". */
export function opportunityMeta(item: Opportunity, m: Messages): string {
  return fill(m.opp.detail.meta, {
    region: item.region === "indonesia" ? m.opp.filter.region.id : m.opp.filter.region.global,
    sector: item.sectors.map((sector) => m.opp.sector[sector]).join(", "),
    horizon: m.opp.horizon[horizonKey[item.horizon]],
  });
}

/** The five factors of the score breakdown, in the order they are shown (dictionary keys opp.factor.*). */
export const FACTORS = ["demand", "timing", "competition", "capital", "regulatory"] as const;
export type Factor = (typeof FACTORS)[number];

/** The width of a bar, in whole percent: the score clamped to 0–100. */
export const barPercent = (value: number) => Math.min(100, Math.max(0, Math.round(value)));

/** One row per factor from the newest score row, in display order; none when there is no score row. */
export function factorRows(score: Pick<OpportunityScore, Factor> | null): { factor: Factor; value: number }[] {
  return score ? FACTORS.map((factor) => ({ factor, value: score[factor] })) : [];
}
