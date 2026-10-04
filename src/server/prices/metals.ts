// The metals job (OR-27): gold and silver in rupiah per gram. The quote is
// gold-api.com spot; the daily history is COMEX futures (GC=F / SI=F, stored as
// "yahoo-futures", never as spot) while PRICES_YAHOO=live, otherwise made up
// ("synthetic"). gold-api.com failing → the futures quote, named in the run's error.
import { hasRealCandles, lastCandleDay, listCandles, replaceWithLiveBackfill, setQuote, upsertAsset, upsertCandles, type Asset, type Candle } from "@/server/data";
import type { JobOutcome } from "@/server/jobs/runner";
import { ASSETS, METALS } from "./assets.ts";
import { frankfurterMode } from "./frankfurter.ts";
import { fetchSpot, FUTURES, goldApiMode } from "./goldapi.ts";
import { fxAsset, MIN_BACKFILL_CANDLES, rangeFor } from "./ingest.ts";
import { fetchChart, HOLDS_REAL, PriceSourceError, yahooMode, type Chart } from "./yahoo.ts";

export const TROY_OUNCE_GRAMS = 31.1035;
// gold-api.com bans an IP for "multiple requests per second" (R-2 §3): its calls are spaced.
export const GOLDAPI_GAP_MS = 1100;
// A futures quote older than this does not stand in for the live price.
const FALLBACK_MAX_AGE_MS = 4 * 24 * 60 * 60 * 1000;

/** USD per troy ounce → rupiah per gram, to the nearest rupiah. */
export function perGram(usdPerOunce: number, usdIdr: number): number {
  return Math.round((usdPerOunce / TROY_OUNCE_GRAMS) * usdIdr);
}

/**
 * The USD/IDR rate for a day: the latest reference rate on or before it (the
 * ECB publishes business days only), or null before the first stored rate.
 */
export function rateLookup(rates: Candle[]): (day: string) => number | null {
  const sorted = [...rates].sort((a, b) => (a.day < b.day ? -1 : 1));
  return (day) => {
    let lo = 0, hi = sorted.length - 1, found: number | null = null;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid].day <= day) {
        found = sorted[mid].close;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return found;
  };
}

const utcDay = (d: Date) => d.toISOString().slice(0, 10);

type Context = { rateOn: (day: string) => number | null; transport?: typeof fetch; now: Date; spaced: () => Promise<void> };

async function metalAsset(asset: Asset, { rateOn, transport, now, spaced }: Context) {
  const historySource = yahooMode() === "live" ? "yahoo-futures" : "synthetic";
  let chart: Chart | null = null;
  let historyError: PriceSourceError | null = null;
  let stored = 0;
  let unconverted = 0;
  try {
    if (historySource === "synthetic" && (await hasRealCandles(asset.id))) throw new PriceSourceError(HOLDS_REAL);
    const range = rangeFor(await lastCandleDay(asset.id, historySource), now);
    chart = await fetchChart(FUTURES[asset.symbol], range, transport);
    if (range === "6y" && chart.candles.length < MIN_BACKFILL_CANDLES) {
      chart = null;
      throw new PriceSourceError(`backfill returned too few days (at least ${MIN_BACKFILL_CANDLES} needed)`);
    }
    const converted = chart.candles.flatMap((c) => {
      const rate = rateOn(c.day);
      if (rate === null) {
        unconverted++; // before the first stored rate: cannot be converted
        return [];
      }
      return [{ ...c, open: perGram(c.open, rate), high: perGram(c.high, rate), low: perGram(c.low, rate), close: perGram(c.close, rate) }];
    });
    stored =
      historySource === "yahoo-futures" && range === "6y"
        ? (await replaceWithLiveBackfill(asset.id, converted, historySource)).stored
        : await upsertCandles(asset.id, historySource, converted);
  } catch (error) {
    if (!(error instanceof PriceSourceError)) throw error;
    historyError = error;
  }

  let fallback: string | null = null;
  const quoteIn = (usd: number, asOf: Date) => {
    const rate = rateOn(utcDay(asOf));
    if (rate === null) throw new PriceSourceError("no USD/IDR rate for the quote's day");
    return perGram(usd, rate);
  };
  try {
    await spaced();
    const spot = await fetchSpot(asset.symbol, transport, now);
    await setQuote(asset.id, { price: quoteIn(spot.price, spot.asOf), asOf: spot.asOf, source: spot.source });
  } catch (error) {
    if (!(error instanceof PriceSourceError)) throw error;
    const failed = `gold-api.com failed (${error.message})`;
    // No fallback (no futures, or too old): the previous quote stays.
    if (!chart?.quote) throw historyError ?? new PriceSourceError(failed);
    if (now.getTime() - chart.quote.asOf.getTime() > FALLBACK_MAX_AGE_MS) throw new PriceSourceError(`${failed}; the futures quote is too old to use`);
    const futures = `${historySource === "synthetic" ? "synthetic (made-up) futures" : "Yahoo futures"} ${FUTURES[asset.symbol]}`;
    const written = await setQuote(asset.id, { price: quoteIn(chart.quote.price, chart.quote.asOf), asOf: chart.quote.asOf, source: historySource });
    fallback = written ? `${failed}; quote from the ${futures} fallback` : `${failed}; the ${futures} fallback was not used over the stored real quote`;
    console.warn(`metals: ${asset.slug}: ${fallback}`);
  }
  if (historyError) throw historyError;
  return { stored, unconverted, fallback };
}

export async function ingestMetals(
  options: { transport?: typeof fetch; now?: () => Date; sleep?: (ms: number) => Promise<void> } = {},
): Promise<JobOutcome> {
  const now = options.now?.() ?? new Date();
  const live = goldApiMode() === "live"; // a wrong switch fails the run before anything is fetched
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let goldApiCalls = 0;
  const spaced = async () => {
    if (live && goldApiCalls++ > 0) await sleep(GOLDAPI_GAP_MS);
  };
  yahooMode();
  frankfurterMode();
  const counts = { assets_ok: 0, assets_failed: 0, candles: 0, fallbacks: 0, days_unconverted: 0 };
  const problems: string[] = [];

  // The conversion needs USD/IDR: refreshed here too (at most every 6 hours), else the stored rates are used.
  const fx = await upsertAsset(ASSETS.find((a) => a.slug === "usd-idr")!);
  try {
    await fxAsset(fx, options.transport, now);
  } catch (error) {
    if (!(error instanceof PriceSourceError)) throw error;
    problems.push(`usd-idr (${error.message}; stored rates used)`);
  }
  const rates = await listCandles(fx.id, "1900-01-01", utcDay(now));
  if (rates.length === 0) throw new Error("no USD/IDR rate stored: metal prices cannot be converted");
  const rateOn = rateLookup(rates);

  for (const config of METALS) {
    const asset = await upsertAsset(config);
    try {
      const { stored, unconverted, fallback } = await metalAsset(asset, { rateOn, transport: options.transport, now, spaced });
      counts.candles += stored;
      counts.days_unconverted += unconverted;
      counts.assets_ok++;
      if (fallback) {
        counts.fallbacks++;
        problems.push(`${asset.slug} (${fallback})`);
      }
    } catch (error) {
      if (!(error instanceof PriceSourceError)) throw error;
      counts.assets_failed++;
      problems.push(`${asset.slug} (${error.message})`);
    }
  }
  const summary = problems.join(", ");
  if (counts.assets_failed === METALS.length) throw new Error(`${METALS.length} of ${METALS.length} metals failed: ${summary}`);
  return problems.length ? { status: "partial", counts, error: summary } : { status: "ok", counts };
}
