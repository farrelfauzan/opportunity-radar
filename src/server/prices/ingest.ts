// The prices job (OR-26): daily candles and the latest quote of every Yahoo
// asset, and USD/IDR from Frankfurter. A source that fails keeps its previous
// quote (same price, same as-of time) and makes the run "partial".
import { getQuote, hasRealCandles, lastCandleDay, replaceWithLiveBackfill, setQuote, upsertAsset, upsertCandles, type Asset } from "@/server/data";
import type { JobOutcome } from "@/server/jobs/runner";
import { ASSETS } from "./assets.ts";
import { fetchUsdIdr, frankfurterMode } from "./frankfurter.ts";
import { fetchChart, HOLDS_REAL, PriceSourceError, yahooMode } from "./yahoo.ts";

export const DAY_MS = 24 * 60 * 60 * 1000;
export const BACKFILL_YEARS = 6; // the 5Y chart needs a 200-day average from its first day
const FX_CACHE_MS = 6 * 60 * 60 * 1000;
// A backfill shorter than this is not trusted: the 200-day average needs 200 days.
export const MIN_BACKFILL_CANDLES = 200;

/** The Yahoo range that covers everything since the last stored day (6 years when there is none). */
export function rangeFor(lastDay: string | null, now: Date): string {
  if (!lastDay) return "6y";
  const days = (now.getTime() - Date.parse(`${lastDay}T00:00:00Z`)) / DAY_MS;
  return days <= 4 ? "5d" : days <= 28 ? "1mo" : days <= 360 ? "1y" : "6y";
}

async function yahooAsset(asset: Asset, transport: typeof fetch | undefined, now: Date) {
  // The range comes from the newest candle of the source in use, so the first live run
  // backfills 6 years instead of continuing a made-up history.
  const source = yahooMode() === "live" ? "yahoo" : "synthetic";
  if (source === "synthetic" && (await hasRealCandles(asset.id))) throw new PriceSourceError(HOLDS_REAL);
  const range = rangeFor(await lastCandleDay(asset.id, source), now);
  const chart = await fetchChart(asset.symbol, range, transport);
  if (range === "6y" && chart.candles.length < MIN_BACKFILL_CANDLES) {
    // An empty, all-null or very short reply must not replace a history: the asset keeps what it has.
    throw new PriceSourceError(`backfill returned ${chart.candles.length} days (at least ${MIN_BACKFILL_CANDLES} needed)`);
  }
  let stored: number;
  if (chart.source === "yahoo" && range === "6y") {
    // The first live backfill replaces the made-up history in one transaction.
    stored = (await replaceWithLiveBackfill(asset.id, chart.candles)).stored;
  } else {
    // "synthetic" in fixtures mode: made-up prices must never look like Yahoo's.
    stored = await upsertCandles(asset.id, chart.source, chart.candles);
  }
  if (chart.quote) await setQuote(asset.id, { ...chart.quote, source: chart.source });
  return stored;
}

export async function fxAsset(asset: Asset, transport: typeof fetch | undefined, now: Date) {
  // ECB rates change once a day: fetch at most every 6 hours.
  const quote = await getQuote(asset.id);
  if (quote && now.getTime() - quote.fetchedAt.getTime() < FX_CACHE_MS) return 0;
  const last = await lastCandleDay(asset.id);
  const since = last ?? new Date(now.getTime() - BACKFILL_YEARS * 366 * DAY_MS).toISOString().slice(0, 10);
  const rates = await fetchUsdIdr(since, transport);
  const stored = await upsertCandles(asset.id, "frankfurter", rates);
  const latest = rates[rates.length - 1];
  // As-of is the reference day (the ECB sets the rate once a day); stored as 00:00 UTC of that day.
  if (latest) await setQuote(asset.id, { price: latest.close, asOf: new Date(`${latest.day}T00:00:00Z`), source: "frankfurter" });
  return stored;
}

export async function ingestPrices(options: { transport?: typeof fetch; now?: () => Date } = {}): Promise<JobOutcome> {
  const now = options.now?.() ?? new Date();
  yahooMode(); // a wrong switch fails the run before anything is fetched
  frankfurterMode();
  const counts = { assets_ok: 0, assets_failed: 0, candles: 0 };
  const failures: string[] = [];
  for (const config of ASSETS) {
    const asset = await upsertAsset(config);
    try {
      counts.candles += asset.source === "frankfurter" ? await fxAsset(asset, options.transport, now) : await yahooAsset(asset, options.transport, now);
      counts.assets_ok++;
    } catch (error) {
      if (!(error instanceof PriceSourceError)) throw error;
      counts.assets_failed++;
      failures.push(`${asset.slug} (${error.message})`);
    }
  }
  const summary = `${failures.length} of ${ASSETS.length} assets failed: ${failures.join(", ")}`;
  if (failures.length === ASSETS.length) throw new Error(summary);
  return failures.length ? { status: "partial", counts, error: summary } : { status: "ok", counts };
}
