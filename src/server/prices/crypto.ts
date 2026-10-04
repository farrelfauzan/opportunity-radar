// The crypto job (OR-27): Bitcoin and Ethereum daily candles and price in USD
// from Binance, and their rupiah price from Indodax. Same failure rules as the
// prices job: a failing source keeps its quote and as-of; the run is partial.
import { hasRealCandles, lastCandleDay, replaceWithLiveBackfill, setQuote, upsertAsset, upsertCandles, type Asset, type Candle } from "@/server/data";
import type { JobOutcome } from "@/server/jobs/runner";
import { CRYPTO } from "./assets.ts";
import { cryptoMode, fetchKlines, fetchTicker, KLINE_LIMIT } from "./binance.ts";
import { fetchIdrPrice } from "./indodax.ts";
import { BACKFILL_YEARS, DAY_MS, MIN_BACKFILL_CANDLES } from "./ingest.ts";
import { HOLDS_REAL, PriceSourceError } from "./yahoo.ts";

const MAX_PAGES = 4; // 6 years of days is 3 pages of 1000

async function binanceAsset(asset: Asset, transport: typeof fetch | undefined, now: Date) {
  const source = cryptoMode() === "live" ? "binance" : "synthetic";
  if (source === "synthetic" && (await hasRealCandles(asset.id))) throw new PriceSourceError(HOLDS_REAL);
  const last = await lastCandleDay(asset.id, source);
  // From the last stored day (the running day is fetched again), or 6 years back.
  let start = last ? Date.parse(`${last}T00:00:00Z`) : now.getTime() - BACKFILL_YEARS * 366 * DAY_MS;
  const rows: Candle[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const batch = await fetchKlines(asset.symbol, start, transport, now);
    rows.push(...batch);
    if (batch.length < KLINE_LIMIT) break;
    start = Date.parse(`${batch[batch.length - 1].day}T00:00:00Z`) + DAY_MS;
  }
  if (!last && rows.length < MIN_BACKFILL_CANDLES) {
    throw new PriceSourceError(`backfill returned ${rows.length} days (at least ${MIN_BACKFILL_CANDLES} needed)`);
  }
  const stored =
    source === "binance" && !last ? (await replaceWithLiveBackfill(asset.id, rows, source)).stored : await upsertCandles(asset.id, source, rows);
  // The ticker has no time: as-of is when it was fetched (crypto trades around the clock).
  await setQuote(asset.id, { price: await fetchTicker(asset.symbol, transport, now), asOf: now, source });
  return stored;
}

async function idrAsset(asset: Asset, transport: typeof fetch | undefined, now: Date) {
  await setQuote(asset.id, await fetchIdrPrice(asset.symbol, transport, now));
  return 0;
}

export async function ingestCrypto(options: { transport?: typeof fetch; now?: () => Date } = {}): Promise<JobOutcome> {
  const now = options.now?.() ?? new Date();
  cryptoMode(); // a wrong switch fails the run before anything is fetched
  const counts = { assets_ok: 0, assets_failed: 0, candles: 0 };
  const failures: string[] = [];
  for (const config of CRYPTO) {
    const asset = await upsertAsset(config);
    try {
      counts.candles += asset.source === "indodax" ? await idrAsset(asset, options.transport, now) : await binanceAsset(asset, options.transport, now);
      counts.assets_ok++;
    } catch (error) {
      if (!(error instanceof PriceSourceError)) throw error;
      counts.assets_failed++;
      failures.push(`${asset.slug} (${error.message})`);
    }
  }
  const summary = `${failures.length} of ${CRYPTO.length} assets failed: ${failures.join(", ")}`;
  if (failures.length === CRYPTO.length) throw new Error(summary);
  return failures.length ? { status: "partial", counts, error: summary } : { status: "ok", counts };
}
