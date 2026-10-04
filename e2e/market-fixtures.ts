// Deterministic market data for the Radar's market snapshot in the browser tests. Pure data (no database
// access): scripts/e2e-db.ts stores it, e2e/radar.spec.ts reads the expectations from it.
// Each asset has 10 daily closes on the 10 days up to yesterday (UTC); the last close is the previous close the
// 1-day change is measured against, and the quote is newer than every candle.
// The Investments watchlist (OR-30) reads the same rows: the four above (USD/IDR is not on the watchlist) and the
// four added at the end (BBCA, S&P 500, Silver, Ethereum, with 30 closes), with their signals in `fixtureSignals`.

export type FixtureMarket = {
  slug: "ihsg" | "usd-idr" | "gold" | "bitcoin" | "bbca" | "sp500" | "silver" | "ethereum";
  symbol: string;
  name: string;
  kind: "index" | "stock" | "fx" | "metal" | "crypto";
  exchange: string | null;
  currency: string;
  source: string;
  /** The quote's source: "synthetic" rows get the Sample badge. */
  quoteSource: string;
  /** The candles' source when it is not the asset's (made-up closes under a made-up quote). */
  candleSource?: string;
  /** False for an asset that is stored but not on the watchlist (USD/IDR). */
  onWatchlist?: false;
  price: number;
  /** Daily closes, oldest first. */
  closes: number[];
  /** A daily rate with no time of day: stored at 00:00 UTC of today, shown as "As of {date}". */
  daily?: true;
};

export const fixtureMarket: FixtureMarket[] = [
  // Real, up 0.6% (7,412 against 7,368).
  { slug: "ihsg", symbol: "^JKSE", name: "IHSG", kind: "index", exchange: "IDX", currency: "IDR", source: "yahoo", quoteSource: "yahoo", price: 7412, closes: [7250, 7290, 7270, 7310, 7340, 7330, 7355, 7380, 7360, 7368] },
  // Synthetic, down 0.2% (16,240 against 16,273).
  { slug: "usd-idr", symbol: "USD/IDR", name: "USD/IDR", kind: "fx", exchange: null, currency: "IDR", source: "frankfurter", quoteSource: "synthetic", price: 16240, closes: [16300, 16300, 16310, 16280, 16290, 16260, 16275, 16265, 16250, 16273], daily: true, onWatchlist: false },
  // Real, unchanged: +0.005% rounds to 0.0%.
  { slug: "gold", symbol: "XAU", name: "Gold", kind: "metal", exchange: null, currency: "IDR", source: "gold-api", quoteSource: "gold-api", price: 1935100, closes: [1890000, 1900000, 1905000, 1910000, 1912000, 1920000, 1918000, 1925000, 1930000, 1935000] },
  // Synthetic, down 2.3% ($98,400 against $100,700).
  { slug: "bitcoin", symbol: "BTCUSDT", name: "Bitcoin", kind: "crypto", exchange: null, currency: "USD", source: "binance", quoteSource: "synthetic", price: 98400, closes: [104000, 105500, 103000, 104200, 102000, 103100, 101500, 100200, 101000, 100700] },
  // The watchlist's other rows, 30 closes each. Real, down 0.3% (9,875 against 9,900).
  { slug: "bbca", symbol: "BBCA.JK", name: "BBCA", kind: "stock", exchange: "IDX", currency: "IDR", source: "yahoo", quoteSource: "yahoo", price: 9875, closes: walk(9500, 9900, 30, 40) },
  // Real, up 0.4% (6,820 against 6,793).
  { slug: "sp500", symbol: "^GSPC", name: "S&P 500", kind: "index", exchange: "US", currency: "USD", source: "yahoo", quoteSource: "yahoo", price: 6820, closes: walk(6500, 6793, 30, 25) },
  // Real, up 0.8% (22,400 against 22,222).
  { slug: "silver", symbol: "XAG", name: "Silver", kind: "metal", exchange: null, currency: "IDR", source: "gold-api", quoteSource: "gold-api", price: 22400, closes: walk(21000, 22222, 30, 120) },
  // Made-up quote over made-up closes, down 3.1% ($3,120 against $3,220): the Bitcoin row above has a made-up quote
  // over real closes, which the watchlist reads as mixed and shows with no change and no sparkline.
  { slug: "ethereum", symbol: "ETHUSDT", name: "Ethereum", kind: "crypto", exchange: null, currency: "USD", source: "binance", quoteSource: "synthetic", candleSource: "synthetic", price: 3120, closes: walk(3500, 3220, 30, 30) },
];

/**
 * n closes from `from` to `last` (the last one exactly), with a small deterministic wiggle of up to `amplitude`
 * so the sparkline is not a straight line.
 */
function walk(from: number, last: number, n: number, amplitude: number): number[] {
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? last : Math.round(from + ((last - from) * i) / (n - 1) + (((i * 7) % 5) - 2) * (amplitude / 2))));
}

export type FixtureSignalState = "BUY" | "HOLD" | "SELL" | "INSUFFICIENT" | "STALE";
type SignalFixture = Partial<Record<"short" | "long", FixtureSignalState>>;

/**
 * The stored signals of the watchlist assets (a term that is missing has no row at all). A STALE row keeps its last
 * verdict (BUY), which the screen must not show. The rows whose quote is synthetic are stored `synthetic` (unless the
 * fixtures are stored with --real-prices), so they read as "No signal: sample data".
 */
export const fixtureSignals: Partial<Record<FixtureMarket["slug"], SignalFixture>> = {
  ihsg: { short: "BUY", long: "HOLD" },
  bbca: { short: "SELL", long: "INSUFFICIENT" },
  sp500: { long: "BUY" },
  gold: { short: "HOLD", long: "BUY" },
  silver: { short: "BUY", long: "STALE" },
  bitcoin: { short: "SELL", long: "HOLD" },
  ethereum: { short: "SELL", long: "SELL" },
};
