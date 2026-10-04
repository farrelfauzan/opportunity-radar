import { asc, eq, inArray, lte, sql } from "drizzle-orm";
import { db } from "./client.ts";
import { priceRow, type PriceRow, type StoredCandle } from "./market.ts";
import { assets, candles, quotes, type AssetKind } from "./schema.ts";
import { signalViews, type SignalView } from "./signals.ts";

/** How many daily closes the watchlist's sparkline draws. */
export const WATCHLIST_CLOSES = 30;

/** The v1 watchlist in the order the screen shows it (design: Invest.dc.html); assets added later follow, by id. */
const DISPLAY_ORDER = ["ihsg", "bbca", "sp500", "gold", "silver", "bitcoin", "ethereum"];

export type WatchlistRow = {
  assetId: number;
  slug: string;
  symbol: string;
  kind: AssetKind;
  exchange: string | null;
  currency: string;
  /** Where the asset's prices come from (assets.source): decides which job feeds it. */
  assetSource: string;
  /** The price; null when the asset has neither a quote nor a candle yet (the row then shows no price). */
  price: PriceRow | null;
  /** Both terms as the screens show them (`signalViews`): no entry for a term that has never been computed. */
  signals: SignalView[];
};

/**
 * The price of one watchlist asset. Provenance must not mix: a price and closes of the other kind (a made-up
 * price against real closes, or the reverse while a live backfill is pending) are no basis for a change or a
 * sparkline, so a series with a candle of the other kind than the price gives neither.
 */
export function watchlistPrice(
  quote: { price: number; asOf: Date; source: string; fetchedAt: Date } | null,
  series: StoredCandle[],
): PriceRow | null {
  const row = priceRow(quote, series);
  if (!row) return null;
  const mixed = series.some((c) => (c.source === "synthetic") !== row.synthetic);
  return mixed ? { ...row, previousClose: null, closes: [] } : row;
}

/**
 * The rows of the Investments watchlist: every asset with `onWatchlist`, in display order, each with its price
 * (the quote, else the last close), the previous close, up to WATCHLIST_CLOSES daily closes (oldest first), and its
 * signals. Three queries for all assets, plus one `signalViews` read per asset. Empty when no asset is stored.
 */
export async function getWatchlist(): Promise<WatchlistRow[]> {
  const found = await db()
    .select({ asset: assets, quote: quotes })
    .from(assets)
    .leftJoin(quotes, eq(quotes.assetId, assets.id))
    .where(eq(assets.onWatchlist, true))
    .orderBy(asc(assets.id));
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
        found.map((f) => f.asset.id),
      ),
    )
    .as("ranked");
  const [recent, views] = await Promise.all([
    db().select().from(ranked).where(lte(ranked.n, WATCHLIST_CLOSES)).orderBy(asc(ranked.assetId), asc(ranked.day)),
    Promise.all(found.map((f) => signalViews(f.asset.id))),
  ]);

  const rank = (slug: string) => {
    const index = DISPLAY_ORDER.indexOf(slug);
    return index === -1 ? DISPLAY_ORDER.length : index;
  };
  return found
    .map(({ asset, quote }, i): WatchlistRow => ({
      assetId: asset.id,
      slug: asset.slug,
      symbol: asset.symbol,
      kind: asset.kind,
      exchange: asset.exchange,
      currency: asset.currency,
      assetSource: asset.source,
      price: watchlistPrice(
        quote,
        recent.filter((c) => c.assetId === asset.id),
      ),
      signals: views[i],
    }))
    .sort((a, b) => rank(a.slug) - rank(b.slug) || a.assetId - b.assetId);
}
