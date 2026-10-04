import type { Messages } from "@/i18n/t";
import { trendText } from "@/lib/opportunities/view";

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
