import { asc, eq, inArray, lte, sql } from "drizzle-orm";
import { db } from "./client.ts";
import { assets, candles, quotes } from "./schema.ts";

/** The assets of the Radar's market snapshot, in the order the rows are shown. */
export const MARKET_SLUGS = ["ihsg", "usd-idr", "gold", "bitcoin"] as const;
export type MarketSlug = (typeof MARKET_SLUGS)[number];

/** How many daily closes the sparkline draws. */
export const SPARKLINE_CLOSES = 10;

/** The price of one asset with its change and closes (the rows of the market snapshot and of the watchlist share it). */
export type PriceRow = {
  /** The quote's price; the last close when the asset has no quote. */
  price: number;
  /** When the price is from: the quote's as-of time, or 00:00 UTC of the last candle's day without a quote. */
  asOf: Date;
  /** False when the price is a last close (no quote): `asOf` then only has a date. */
  timed: boolean;
  /** When the store last wrote the price (the quote's, else the last candle's); the stale fallback for a job that never ran. */
  updatedAt: Date;
  /** The quote's source (the last candle's without a quote). */
  source: string;
  /** The price is made-up fixtures data. The quote's source is the truth: a synthetic value never replaces a real one. */
  synthetic: boolean;
  /** The close the 1-day change is measured against; null when there is no earlier close. */
  previousClose: number | null;
  /** Up to SPARKLINE_CLOSES daily closes, oldest first. */
  closes: number[];
};

export type MarketRow = PriceRow & { slug: MarketSlug };

export type StoredCandle = { day: string; close: number; source: string; fetchedAt: Date };

/**
 * The price of an asset from its quote and its newest candles (oldest first), or null with neither.
 *
 * - Price shown: the quote's price; without a quote, the last close.
 * - 1-day change: that price against the previous trading day's close. A candle is stamped with its exchange
 *   day, which for these four assets is the UTC date of the quote's as-of time (IDX hours are the same day in
 *   UTC and WIB; the Frankfurter rate is stored at 00:00 UTC of its day). When the last candle is on that day
 *   (or later) it is the day in progress, so the previous close is the candle before it; when the quote is
 *   newer than every candle, the last candle is the previous close. Without a quote the last close is the
 *   price and the candle before it the previous close.
 * - Sparkline: the last SPARKLINE_CLOSES closes, oldest first (the view hides it under 2 points).
 * - Candles of the other kind than the price (synthetic vs real) are ignored for both, so the row then has no
 *   change and no sparkline rather than a made-up one without its badge.
 */
export function priceRow(
  quote: { price: number; asOf: Date; source: string; fetchedAt: Date } | null,
  series: StoredCandle[],
): PriceRow | null {
  const last = series.at(-1);
  if (!quote && !last) return null;
  const synthetic = (quote?.source ?? last!.source) === "synthetic";
  // A price is only compared with, and drawn beside, closes of its own kind: a real quote against made-up
  // candles (or the reverse, e.g. right after live prices are switched on) would show an unbadged made-up change.
  const own = series.filter((c) => (c.source === "synthetic") === synthetic);
  const lastOwn = own.at(-1);
  const closes = own.map((c) => c.close);
  const sameDay = quote && lastOwn ? lastOwn.day >= quote.asOf.toISOString().slice(0, 10) : !quote;
  const previousClose = (sameDay ? own.at(-2) : lastOwn)?.close ?? null;
  return {
    price: quote?.price ?? last!.close,
    asOf: quote?.asOf ?? new Date(`${last!.day}T00:00:00Z`),
    timed: quote !== null,
    updatedAt: quote?.fetchedAt ?? last!.fetchedAt,
    source: quote?.source ?? last!.source,
    synthetic,
    previousClose,
    closes,
  };
}

/** One row of the snapshot: `priceRow` of the asset with its slug. */
export function marketRow(
  slug: MarketSlug,
  quote: { price: number; asOf: Date; source: string; fetchedAt: Date } | null,
  series: StoredCandle[],
): MarketRow | null {
  const row = priceRow(quote, series);
  return row && { slug, ...row };
}

/**
 * The rows of the Radar's market snapshot (IHSG, USD/IDR, Gold per gram, Bitcoin), in that order, from the
 * store only: two queries for all four assets. An asset with neither a quote nor a candle (or not stored at
 * all) is left out, so the result may be empty.
 */
export async function getMarketSnapshot(): Promise<MarketRow[]> {
  const found = await db()
    .select({ id: assets.id, slug: assets.slug, quote: quotes })
    .from(assets)
    .leftJoin(quotes, eq(quotes.assetId, assets.id))
    .where(inArray(assets.slug, [...MARKET_SLUGS]));
  if (found.length === 0) return [];

  const ranked = db()
    .select({
      assetId: candles.assetId,
      day: candles.day,
      close: candles.close,
      source: candles.source,
      fetchedAt: candles.fetchedAt,
      n: sql<number>`row_number() over (partition by ${candles.assetId} order by ${candles.day} desc)`.as("n"),
    })
    .from(candles)
    .where(
      inArray(
        candles.assetId,
        found.map((a) => a.id),
      ),
    )
    .as("ranked");
  const recent = await db()
    .select()
    .from(ranked)
    .where(lte(ranked.n, SPARKLINE_CLOSES))
    .orderBy(asc(ranked.assetId), asc(ranked.day));

  return MARKET_SLUGS.flatMap((slug) => {
    const asset = found.find((a) => a.slug === slug);
    if (!asset) return [];
    const series = recent.filter((c) => c.assetId === asset.id);
    return marketRow(slug, asset.quote, series) ?? [];
  });
}
